import { Request, Response, NextFunction } from 'express';

// Extendemos el Request de Express para incluir la info del tenant
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        company: 'inttec' | 'daravisa';
        env: 'cloud' | 'test';
      };
    }
  }
}

export const tenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const companyHeader = req.headers['x-company'] as string;
  const envHeader = req.headers['x-env'] as string;

  // Valores por defecto
  let company: 'inttec' | 'daravisa' = 'inttec';
  let env: 'cloud' | 'test' = 'cloud';

  if (companyHeader === 'daravisa') {
    company = 'daravisa';
  }

  if (envHeader === 'test') {
    env = 'test';
  }

  req.tenant = { company, env };

  next();
};
