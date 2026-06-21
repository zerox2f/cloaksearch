declare module 'express-serve-static-core' {
  // Minimal stub to satisfy TypeScript compilation when @types/express are not present.
  import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction as ExpressNext } from 'express';
  export type Request<P = any, ResBody = any, ReqBody = any, ReqQuery = any, Locals = any> = ExpressRequest<P, ResBody, ReqBody, ReqQuery, Locals>;
  export type Response<ResBody = any, Locals = any> = ExpressResponse<ResBody, Locals>;
  export type NextFunction = ExpressNext;
}

declare module 'cors' {
  const cors: any;
  export default cors;
}

declare module 'p-limit' {
  const pLimit: any;
  export default pLimit;
}
