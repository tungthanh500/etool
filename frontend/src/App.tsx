import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/theme";
import { ToastProvider } from "./components/ui/toast";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentListPage } from "./pages/DocumentListPage";
import { CreateDocumentPage } from "./pages/CreateDocumentPage";
import { DocumentDetailPage } from "./pages/DocumentDetailPage";
import { UserListPage } from "./pages/UserListPage";
import { UserFormPage } from "./pages/UserFormPage";
import { DepartmentListPage } from "./pages/DepartmentListPage";
import { WorkflowListPage } from "./pages/WorkflowListPage";
import { WorkflowFormPage } from "./pages/WorkflowFormPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { AccountPage } from "./pages/AccountPage";

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              {/* Mọi trang đã đăng nhập nằm trong app shell (sidebar + topbar) */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/documents" element={<DocumentListPage />} />
                <Route path="/documents/new" element={<CreateDocumentPage />} />
                <Route path="/documents/:id" element={<DocumentDetailPage />} />
                <Route path="/users" element={<UserListPage />} />
                <Route path="/users/new" element={<UserFormPage />} />
                <Route path="/users/:id/edit" element={<UserFormPage />} />
                <Route path="/departments" element={<DepartmentListPage />} />
                <Route path="/workflows" element={<WorkflowListPage />} />
                <Route path="/workflows/new" element={<WorkflowFormPage />} />
                <Route path="/workflows/:id/edit" element={<WorkflowFormPage />} />
                <Route path="/audit" element={<AuditLogPage />} />
                <Route path="/account" element={<AccountPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
