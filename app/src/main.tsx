import "@/lib/logger";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.tsx";
import { PreferencesProvider } from "./providers/preferences";
import { WorkspaceProvider } from "./services/provider";
import { HttpWorkspaceService } from "./services/http";
import { TauriWorkspaceService } from "./services/tauri";
import { FileProvider } from "./services/fileProvider";
import { BrowserFilePort } from "./services/browserFiles";
import { TauriFilePort } from "./services/tauriFiles";

const queryClient = new QueryClient();
const workspaceService = "__TAURI_INTERNALS__" in window
  ? new TauriWorkspaceService()
  : new HttpWorkspaceService();
const fileService = "__TAURI_INTERNALS__" in window ? new TauriFilePort() : new BrowserFilePort();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <WorkspaceProvider service={workspaceService}>
          <FileProvider files={fileService}>
            <PreferencesProvider>
              <App />
            </PreferencesProvider>
          </FileProvider>
        </WorkspaceProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
