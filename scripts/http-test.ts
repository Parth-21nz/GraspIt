import supertest from 'supertest';

/** Tests use the same custom-header/cookie/CSRF contract as the browser. */
export function testRequest(app: Parameters<typeof supertest>[0]) {
  const client = supertest(app);
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const) {
    const original = client[method].bind(client);
    (client as any)[method] = (url: string) => original(url).set('X-GraspIt-Client', 'web');
  }
  return client;
}
export function sessionFromResponse(response: { headers: Record<string, any>; body: any }): string {
  const values = response.headers['set-cookie'];
  const cookies = (Array.isArray(values) ? values : [values]).filter(Boolean).map((value: string) => value.split(';')[0]).join('; ');
  if (!cookies || !response.body.csrfToken) throw new Error('The response did not create a cookie session.');
  return JSON.stringify({ cookie: cookies, csrfToken: response.body.csrfToken });
}
export function sessionHeaders(session?: string): Record<string, string> {
  const headers: Record<string, string> = { 'X-GraspIt-Client': 'web' };
  if (session) { const value = JSON.parse(session); headers.Cookie = value.cookie; headers['X-CSRF-Token'] = value.csrfToken; }
  return headers;
}
