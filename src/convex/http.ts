import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { ingest } from "./smsGateway";

const http = httpRouter();

auth.addHttpRoutes(http);

// SMS Gateway webhook — phones running react-native-sms-gateway POST here.
http.route({
  path: "/api/sms-gateway",
  method: "POST",
  handler: ingest,
});

export default http;
