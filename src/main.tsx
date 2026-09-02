import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Chat = lazy(() => import("./pages/Chat.tsx"));
const GhostWebAI = lazy(() => import("./pages/GhostWebAI.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

function RouteLoading() {
  return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message: string; stack: string }> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) { return { hasError: true, message: error.message || "Unknown runtime error", stack: error.stack || "" }; }
  componentDidCatch(err: Error) { console.error("[Ghost.app] Root crash:", err); }
  render() {
    if (this.state.hasError) return <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6"><div className="max-w-lg text-center"><p className="text-sm font-semibold">Runtime error</p><p className="mt-2 text-xs text-muted-foreground break-words">{this.state.message}</p></div></div>;
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => { window.parent.postMessage({ type: "iframe-route-change", path: location.pathname }, "*"); }, [location.pathname]);
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/ai" element={<GhostWebAI />} />
              <Route path="/auth" element={<AuthPage redirectAfterAuth="/chat" />} />
              <Route path="/chat" element={<RequireAuth><Chat /></RequireAuth>} />
              <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
