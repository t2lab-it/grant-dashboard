import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { routes } from "./routes";

const queryClient = new QueryClient();
const routerBasename = import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL;
const router = createBrowserRouter(routes, { basename: routerBasename });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
