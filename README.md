# Web API Security & File Management System

This project contains a comprehensive dual-backend solution for secure user authentication and personalized file access. 

The two implementations are:
1. **Node.js & PostgreSQL Custom API**: A robust, fully-coded backend service built with Express.js.
2. **Appwrite Cloud Integration**: A client-side adapter utilizing the Appwrite Web SDK for a managed backend approach.

Both implementations connect to the same versatile frontend interface (\`index.html\`), easily swappable via UI toggles.

---

## 🛠️ How to Run the Project

### Option A: Custom Node.js & Postgres Backend
This environment utilizes Docker for database orchestration. 

**Requirements:** Node.js (v18 or higher) and Docker Desktop.

1. **Enter the backend folder:**
   \`\`\`bash
   cd custom-backend
   \`\`\`
2. **Download required Node modules:**
   \`\`\`bash
   npm install
   \`\`\`
3. **Launch the PostgreSQL Container:**
   \`\`\`bash
   docker-compose up -d
   \`\`\`
4. **Provision and populate the DB tables:**
   This command reads from \`seed-data.json\` to create three distinct mock users and their associated documents.
   \`\`\`bash
   node init-db.js
   \`\`\`
5. **Start the Express API server:**
   \`\`\`bash
   node server.js
   \`\`\`
   The service will boot up at \`http://localhost:3000\`.
6. **Launch the Frontend:**
   Open \`frontend/index.html\` in your favorite web browser. Ensure the **Custom Node API** radio button is selected, and click the pre-filled test user buttons to experiment.

### Option B: Appwrite Cloud Integration
To evaluate the Appwrite adapter, you must configure a project on Appwrite Cloud or a local Appwrite instance.

1. Navigate to your Appwrite Dashboard and instantiate a new Project.
2. Initialize a new Database.
3. Within that Database, formulate a Collection named \`files\`. Add the following String attributes:
   - \`ownerId\` (Required)
   - \`fileName\` (Required)
   - \`mimeType\` (Required)
   - \`storageFileId\` (Required)
   - Add one Integer attribute: \`sizeBytes\` (Required)
4. Update the Collection's Security Permissions: Grant users \`read\` and \`write\` access, but restrict it exclusively to documents they create themselves.
5. Provision a Storage Bucket named \`user-files\` and mirror the same restrictive user-level permissions.
6. Open \`frontend/index.html\`.
7. Input your specific Appwrite endpoints and IDs into the **Appwrite Cloud Configuration** inputs.
8. Toggle the **Appwrite Cloud** radio button and test the authentication flows.

---

## 🧠 Architectural Insights

### Authentication Strategy: JWT vs. Session Cookies
For the **Custom Node API**, I opted to implement **JSON Web Tokens (JWT)**. 
- **Scalability**: JWTs eliminate the need for centralized server memory to track active sessions, inherently supporting horizontal scaling across load balancers.
- **Client Flexibility**: The provided \`index.html\` frontend expects explicit token transmission in the request bodies and headers, aligning perfectly with standard JWT bearer patterns.
- Conversely, the **Appwrite** implementation leverages secure HttpOnly cookies, a process fully abstracted and automated by its internal SDK.

### The Mechanics of Secure Logout
Because JWTs are self-contained and stateless, deleting them client-side does not invalidate them on the server. To solve this in the Custom API, I designed a **Token Blacklist Mechanism**. When a user triggers a logout, their active token is injected into a \`token_blacklist\` Postgres table. A custom middleware intercepts every incoming protected request, halting the operation with a \`401 Unauthorized\` if the provided token exists in the blacklist.

### Data Privacy & User Isolation
- **Node API**: Every secured route (e.g., \`/files/:id\`) mandates a valid JWT. The server parses the user's unique ID from the token payload. This ID is subsequently hardcoded into the SQL \`WHERE owner_id = $1\` clause. Therefore, even if an attacker attempts to request a valid file ID belonging to someone else, the SQL condition fails to match, resulting in a \`403 Forbidden\` denial.
- **Appwrite**: Data siloing is handled at the platform level via Document Security Permissions, preventing users from pulling records they did not explicitly author.

### Automation via Appwrite vs. Manual Configuration
- **Platform Automated**: Appwrite natively processed all cryptographic password hashing, secure cookie generation, endpoint rate-limiting, and binary file streaming.
- **Manually Configured**: I built the \`appwrite-adapter.js\` to bridge the UI's generic fetch requests into the specific Appwrite SDK method calls. Furthermore, the Database schemas, collections, attributes, and critical Document-Level Security rules had to be manually provisioned in the Appwrite Dashboard to guarantee data safety.

### Future Enhancements
If afforded more time, I would focus on:
1. **Refresh Tokens**: The current JWT implementation utilizes a strict 1-hour expiration. Adding a refresh token rotation system (stored in HttpOnly cookies) would improve UX without sacrificing security.
2. **Automated Provisioning**: Writing a Node script utilizing the Appwrite Server SDK to instantly construct the necessary collections, buckets, and permissions, removing the need for manual UI setup.
3. **Blacklist Maintenance**: Implementing a scheduled worker process to prune expired JWTs from the Postgres \`token_blacklist\` table to maintain optimal query performance.
4. **Physical File Uploads**: Upgrading the Node API with \`multer\` to accept actual binary \`multipart/form-data\` uploads, rather than solely serving seeded metadata.
