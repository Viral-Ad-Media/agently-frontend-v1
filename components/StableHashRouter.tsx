import React, { Suspense, useLayoutEffect, type ReactNode } from "react";
import { HashRouter, useLocation } from "react-router-dom";

interface StableHashRouterProps {
  children: ReactNode;
  basename?: string;
}

/**
 * Use React Router's supported hash-history integration, but make route
 * updates blocking/synchronous. The previous custom useSyncExternalStore
 * implementation returned history.location directly; createHashHistory may
 * expose a new location object on repeated reads, which causes React error
 * #185 (maximum update depth exceeded) in production.
 */
const StableHashRouter: React.FC<StableHashRouterProps> = ({
  children,
  basename,
}) => (
  <HashRouter basename={basename} unstable_useTransitions={false}>
    {children}
  </HashRouter>
);

interface RouteCommitBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface RouteErrorState {
  error: Error | null;
}

class RouteErrorBoundary extends React.Component<
  { children: ReactNode },
  RouteErrorState
> {
  state: RouteErrorState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[navigation] route render failed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[24rem] items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <i className="fa-solid fa-triangle-exclamation" />
          </div>
          <h2 className="mt-4 text-lg font-black text-slate-900">
            This screen could not finish loading
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Your session is still active. Reload this screen or return to the
            dashboard.
          </p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
            >
              Reload
            </button>
            <a
              href="#/dashboard"
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
            >
              Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * A location-keyed Suspense/error boundary guarantees that the previous route
 * is removed as soon as navigation commits. Even if a future screen suspends
 * or throws during render, React cannot leave the old Profile screen visible
 * under the new URL.
 */
export const RouteCommitBoundary: React.FC<RouteCommitBoundaryProps> = ({
  children,
  fallback,
}) => {
  const location = useLocation();
  const routeKey = `${location.key}:${location.pathname}${location.search}`;

  useLayoutEffect(() => {
    document.documentElement.dataset.agentlyRoute = location.pathname;
    window.dispatchEvent(
      new CustomEvent("agently:route-committed", {
        detail: {
          key: location.key,
          pathname: location.pathname,
          search: location.search,
        },
      }),
    );
  }, [location.key, location.pathname, location.search]);

  return (
    <RouteErrorBoundary key={routeKey}>
      <Suspense key={routeKey} fallback={fallback}>
        {children}
      </Suspense>
    </RouteErrorBoundary>
  );
};

export default StableHashRouter;
