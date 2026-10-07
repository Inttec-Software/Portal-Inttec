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

  // Si el proceso del backend está configurado con APP_ENV (ej. en Lightsail test),
  // se fuerza ese entorno para evitar cualquier fuga de datos accidental entre test y prod.
  const processEnv = process.env.APP_ENV;
  if (processEnv === 'test') {
    env = 'test';
  } else if (processEnv === 'prod' || processEnv === 'cloud') {
    env = 'cloud';
  } else if (envHeader === 'test') {
    env = 'test';
  }

  req.tenant = { company, env };

  next();
};
