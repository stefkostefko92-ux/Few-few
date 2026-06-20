import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("vehicles", "routes/vehicles.tsx"),
  route("vehicles/:id", "routes/vehicle.tsx"),
  route("search", "routes/search.tsx"),
] satisfies RouteConfig;
