import { handleProxyRequest } from "./_shared/proxy.js";

export default async function onRequest(context) {
  return handleProxyRequest(context.request, context.env || {});
}
