(function () {
  if (typeof Appwrite === 'undefined') {
    console.warn('[Appwrite Integrator] Appwrite SDK is missing. Ensure the CDN link is active in index.html.');
    return;
  }

  const { Client, Account, Databases, Storage, ID } = Appwrite;
  let awClient, awAccount, awDb, awStorage;
  let settings = {};

  function setupAppwriteEnvironment() {
    settings = {
      apiUrl: document.getElementById('appwriteEndpoint').value,
      projectId: document.getElementById('appwriteProject').value,
      dbId: document.getElementById('appwriteDb').value,
      collId: document.getElementById('appwriteCollection').value,
      bucketId: document.getElementById('appwriteBucket').value
    };

    awClient = new Client().setEndpoint(settings.apiUrl).setProject(settings.projectId);
    awAccount = new Account(awClient);
    awDb = new Databases(awClient);
    awStorage = new Storage(awClient);
  }

  function formatResponse(code, dataObj) {
    return new Response(JSON.stringify(dataObj), {
      status: code,
      headers: { "Content-Type": "application/json" },
    });
  }

  async function executeAppwriteRegister(reqInfo) {
    const { email, password } = await reqInfo.json();
    if (!email || !password) return formatResponse(400, { error: 'Both email and password are required fields.' });

    try {
      const newUser = await awAccount.create(ID.unique(), email, password);
      return formatResponse(201, { id: newUser.$id, email: newUser.email });
    } catch (err) {
      console.error("[Appwrite] Registration error:", err);
      if (err.code === 409) return formatResponse(409, { error: 'User already exists with this email address.' });
      return formatResponse(500, { error: err.message });
    }
  }

  async function executeAppwriteLogin(reqInfo) {
    const { email, password } = await reqInfo.json();
    try {
      const currentSession = await awAccount.createEmailPasswordSession(email, password);
      return formatResponse(200, { user: { id: currentSession.userId, email } });
    } catch (err) {
      console.error("[Appwrite] Login error:", err);
      return formatResponse(401, { error: 'Authentication failed. Please check credentials.' });
    }
  }

  async function executeAppwriteLogout() {
    try {
      await awAccount.deleteSession('current');
      return formatResponse(200, { message: 'Successfully logged out.' });
    } catch (err) {
      console.error("[Appwrite] Logout error:", err);
      return formatResponse(500, { error: err.message });
    }
  }

  async function executeAppwriteMe() {
    try {
      const profileInfo = await awAccount.get();
      return formatResponse(200, {
        id: profileInfo.$id,
        email: profileInfo.email,
        profile: {
          fullName: profileInfo.name || '',
          createdAt: profileInfo.$createdAt
        }
      });
    } catch (err) {
      console.error("[Appwrite] Profile fetch error:", err);
      return formatResponse(401, { error: 'Session invalid or missing.' });
    }
  }

  async function executeAppwriteFilesList() {
    try {
      const docList = await awDb.listDocuments(settings.dbId, settings.collId);
      
      const mappedFiles = docList.documents.map(item => ({
        id: item.$id,
        ownerId: item.ownerId,
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        uploadedAt: item.$createdAt,
        storageFileId: item.storageFileId
      }));

      return formatResponse(200, { files: mappedFiles });
    } catch (err) {
      console.error("[Appwrite] File list error:", err);
      return formatResponse(500, { error: err.message });
    }
  }

  async function executeAppwriteGetFile(docId) {
    try {
      const item = await awDb.getDocument(settings.dbId, settings.collId, docId);

      return formatResponse(200, {
        file: {
          id: item.$id,
          ownerId: item.ownerId,
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          uploadedAt: item.$createdAt,
          storageFileId: item.storageFileId
        }
      });
    } catch (err) {
      console.error("[Appwrite] File fetch error:", err);
      if (err.code === 404) return formatResponse(404, { error: 'Requested document not found.' });
      return formatResponse(403, { error: 'Insufficient permissions to view this document.' });
    }
  }

  async function executeAppwriteDownload(docId) {
    try {
      const item = await awDb.getDocument(settings.dbId, settings.collId, docId);
      const downloadLink = awStorage.getFileDownload(settings.bucketId, item.storageFileId);
      
      const fileDataRes = await originalFetch(downloadLink.href, { credentials: 'omit' }); 
      
      if (!fileDataRes.ok) {
         return new Response('Access denied to physical file storage.', { status: 403 });
      }

      const fileBlob = await fileDataRes.blob();
      return new Response(fileBlob, { status: 200, headers: { 'Content-Type': item.mimeType } });

    } catch (err) {
      console.error("[Appwrite] Download error:", err);
      return new Response('Resource missing or access denied.', { status: 404 });
    }
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (reqInfo, optionsObj) {
    const appwriteRadio = document.querySelector('input[name="apiMode"][value="appwrite"]');
    if (!appwriteRadio || !appwriteRadio.checked) {
      return originalFetch(reqInfo, optionsObj);
    }

    setupAppwriteEnvironment(); 

    const targetUrl = typeof reqInfo === "string" ? reqInfo : reqInfo.url;
    
    // Ignore external SDK requests
    if (targetUrl.startsWith('http') && !targetUrl.includes(window.location.host)) {
      return originalFetch(reqInfo, optionsObj);
    }
    
    const parsedPath = new URL(targetUrl, window.location.href).pathname;
    const constructedReq = new Request(targetUrl, optionsObj);

    if (parsedPath === "/register" && constructedReq.method === "POST") return executeAppwriteRegister(constructedReq);
    if (parsedPath === "/login" && constructedReq.method === "POST") return executeAppwriteLogin(constructedReq);
    if (parsedPath === "/logout" && constructedReq.method === "POST") return executeAppwriteLogout();
    if (parsedPath === "/me" && constructedReq.method === "GET") return executeAppwriteMe();
    if (parsedPath === "/files" && constructedReq.method === "GET") return executeAppwriteFilesList();

    let pathCheck = parsedPath.match(/^\/files\/([^/]+)\/download$/);
    if (pathCheck && constructedReq.method === "GET") return executeAppwriteDownload(pathCheck[1]);

    pathCheck = parsedPath.match(/^\/files\/([^/]+)$/);
    if (pathCheck && constructedReq.method === "GET") return executeAppwriteGetFile(pathCheck[1]);

    return formatResponse(404, { error: "Path not recognized in Appwrite adapter." });
  };

  console.info("[Appwrite Integrator] Injection complete.");
})();
