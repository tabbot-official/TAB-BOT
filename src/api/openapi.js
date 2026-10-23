import {PREFIX} from './routes.js';
/** OpenAPI 3 document generated from the route table, so docs can never drift from the code. */
export function buildSpec(router, version = '1') {
  const paths = {};
  for (const r of router.routes) {
    const p = r.path.replace(/:([a-zA-Z]+)/g, '{$1}'); paths[p] ||= {};
    const params = (r.path.match(/:([a-zA-Z]+)/g) || []).map((x) => ({name: x.slice(1), in: 'path', required: true, schema: {type: 'string'}}));
    const props = Object.fromEntries(Object.entries(r.body || {}).map(([k, v]) => [k, {type: v.type, ...(v.enum ? {enum: v.enum} : {}), ...(v.max ? {maxLength: v.max} : {})}]));
    paths[p][r.method.toLowerCase()] = {
      tags: [r.tag], summary: r.summary, parameters: params, ...(r.auth ? {security: [{apiKey: []}, {bearer: []}], description: `Requires role: ${r.auth} or higher.`} : {security: []}),
      ...(r.body ? {requestBody: {required: false, content: {'application/json': {schema: {type: 'object', additionalProperties: false, properties: props, required: Object.entries(r.body).filter(([, v]) => v.required).map(([k]) => k)}}}}} : {}),
      responses: {200: {description: 'Success: {success:true,data}', content: {'application/json': {schema: {$ref: '#/components/schemas/Ok'}}}}, 400: {$ref: '#/components/responses/Error'}, 401: {$ref: '#/components/responses/Error'}, 403: {$ref: '#/components/responses/Error'}, 429: {$ref: '#/components/responses/Error'}},
    };
  }
  return {openapi: '3.0.3', info: {title: 'TAB API', version, description: 'Central API for the Tab ecosystem. Standard envelope: {success:true,data} or {success:false,error:{code,message}}.'}, servers: [{url: '/'}], paths,
    components: {securitySchemes: {apiKey: {type: 'apiKey', in: 'header', name: 'X-API-Key'}, bearer: {type: 'http', scheme: 'bearer', bearerFormat: 'JWT'}},
      schemas: {Ok: {type: 'object', properties: {success: {type: 'boolean', example: true}, data: {type: 'object'}}}, Err: {type: 'object', properties: {success: {type: 'boolean', example: false}, error: {type: 'object', properties: {code: {type: 'string'}, message: {type: 'string'}}}}}},
      responses: {Error: {description: 'Error envelope', content: {'application/json': {schema: {$ref: '#/components/schemas/Err'}}}}}}};
}
export const docsHtml = () => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TAB API docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script src="docs.js"></script></body></html>`;
export const docsJs = () => `SwaggerUIBundle({url:'openapi.json',dom_id:'#ui'})`;
export const DOCS_PREFIX = PREFIX;
