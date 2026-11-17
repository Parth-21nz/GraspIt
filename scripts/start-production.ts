// Set this before loading server.ts on Windows as well as Unix shells.
process.env.NODE_ENV = 'production';
await import('../server.ts');
