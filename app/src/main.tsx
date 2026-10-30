import "@/lib/logger";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.tsx";
import { TRPCProvider } from "./providers/trpc";
import { PreferencesProvider } from "./providers/preferences";
import { WorkspaceProvider } from "./services/provider";
import { HttpWorkspaceService } from "./services/http";
import { TauriWorkspaceService } from "./services/tauri";

const queryClient = new QueryClient();
const workspaceService = "__TAURI_INTERNALS__" in window
  ? new TauriWorkspaceService()
  : new HttpWorkspaceService();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <WorkspaceProvider service={workspaceService}>
          <TRPCProvider>
            <PreferencesProvider>
              <App />
            </PreferencesProvider>
          </TRPCProvider>
        </WorkspaceProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
