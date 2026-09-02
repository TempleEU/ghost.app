import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { ingest } from "./smsGateway";
import { claim, sync, ack } from "./ghostlyBridge";

const http = httpRouter();

auth.addHttpRoutes(http);

// SMS Gateway webhook — phones running react-native-sms-gateway POST here.
http.route({
  path: "/api/sms-gateway",
  method: "POST",
  handler: ingest,
});

// Ghostly bridge — native companion device API.
http.route({ path: "/api/ghostly/claim", method: "POST", handler: claim });
http.route({ path: "/api/ghostly/claim", method: "OPTIONS", handler: claim });
http.route({ path: "/api/ghostly/sync", method: "GET", handler: sync });
http.route({ path: "/api/ghostly/sync", method: "OPTIONS", handler: sync });
http.route({ path: "/api/ghostly/ack", method: "POST", handler: ack });
http.route({ path: "/api/ghostly/ack", method: "OPTIONS", handler: ack });

export default http;
