import React, {
  Suspense,
  useCallback,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Router,
  UNSAFE_createHashHistory as createHashHistory,
  useLocation,
} from "react-router-dom";

interface StableHashRouterProps {
  children: ReactNode;
  basename?: string;
}

/**
 * HashRouter in React Router 7 normally stores browser-history updates in
 * component state. Those updates can be scheduled as React transitions, which
 * allows the address bar to move before the matching route is committed.
 *
 * Agently needs the hash and rendered workspace screen to be atomic. Treating
 * history as an external store makes every hash update synchronous and prevents
 * a previous Settings screen from being retained while the URL already points
 * to Knowledge Bases, Team, or Billing.
 */
const StableHashRouter: React.FC<StableHashRouterProps> = ({
  children,
  basename,
}) => {
  const historyRef = useRef<ReturnType<typeof createHashHistory> | null>(null);

  if (!historyRef.current) {
    historyRef.current = createHashHistory({
      window,
      v5Compat: true,
    });
  }

  const history = historyRef.current;
  const subscribe = useCallback(
    (notify: () => void) => history.listen(() => notify()),
    [history],
  );
  const getSnapshot = useCallback(() => history.location, [history]);
  const location = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return (
    <Router
      basename={basename}
      location={location}
      navigationType={history.action}
      navigator={history}
      unstable_useTransitions={false}
    >
      {children}
    </Router>
  );
};

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
