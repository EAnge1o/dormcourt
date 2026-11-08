import { createDatabaseClient, createSiteContext, errorResponse, BackendError } from "./_qoder/backend.mjs";
import { application } from "./routes.mjs";
import { templateVerdict } from "./templates.mjs";

const handle = application({
  db: createDatabaseClient(),
  BackendError,
  verdictProvider: async (c) => ({
    text: templateVerdict(c.scenario, c.options[c.resultIndex]),
    source: "template",
  }),
});

Deno.serve(async (request) => {
  let context;
  try {
    context = createSiteContext(request);
    return await handle(context);
  } catch (error) {
    return errorResponse(error, context?.requestId);
  }
});
