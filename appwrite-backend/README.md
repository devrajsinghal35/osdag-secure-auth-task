# Appwrite Managed Backend Implementation

This folder contains the client-side adapter for integrating the application with Appwrite Cloud or a self-hosted Appwrite instance.

## 📄 Implementation Details

- The implementation logic is defined in [appwrite-adapter.js](appwrite-adapter.js).
- When "Appwrite" mode is enabled in the client interface, this file intercepts global request calls and forwards them directly to the Appwrite Web SDK.
- Authentication (registration, login, logout, user profile) is managed using Appwrite Account services.
- Database access and file storage use Appwrite Databases and Appwrite Storage buckets, enforcing strict Document-Level Security (DLS).

> [!NOTE]
> The `appwrite-adapter.js` file is duplicated in both this folder and the `frontend/` directory. The copy in the `frontend/` directory is required by the testing client (`index.html`) to load the script in the browser, while this folder serves as the distinct backend implementation package. This duplication is intentional.
