import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

interface RawProdServ {
  id: string;
  descripcion: string;
  palabrasSimilares?: string;
  estimuloFranjaFronteriza?: string;
}

interface RawUnidad {
  id: string;
  nombre: string;
  descripcion?: string;
  simbolo?: string;
}

interface IndexedProdServ {
  clave: string;
  descripcion: string;
  palabrasSimilares: string;
  searchKey: string;
}

interface IndexedUnidad {
  clave: string;
  nombre: string;
  descripcion: string;
  simbolo: string;
  searchKey: string;
}

// Función para normalizar texto (sin acentos, minúsculas)
function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

let prodServList: IndexedProdServ[] = [];
let unidadList: IndexedUnidad[] = [];
let isLoaded = false;

function resolveCatalogPath(filename: string): string | null {
  const candidates = [
    path.join(__dirname, '../../', filename),                // Dev: src/modules/sat -> src/
    path.join(__dirname, '../../../src/', filename),         // Prod dist: dist/modules/sat -> src/
    path.join(__dirname, '../..', filename),                 // Alternative dist/
    path.join(process.cwd(), 'src', filename),               // CWD backend/src/
    path.join(process.cwd(), 'backend', 'src', filename),    // CWD project_root/backend/src/
    path.join(process.cwd(), filename)                       // Direct CWD
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

// Carga e indexación en memoria en el inicio del servidor
function loadSatCatalogs() {
  if (isLoaded) return;
  try {
    const prodServPath = resolveCatalogPath('c_ClaveProdServ.json');
    const unidadPath = resolveCatalogPath('c_ClaveUnidad.json');

    if (prodServPath) {
      console.log(`📦 [SAT Catalog] Cargando catálogo completo c_ClaveProdServ desde: ${prodServPath}...`);
      const rawData = fs.readFileSync(prodServPath, 'utf8');
      const parsed: RawProdServ[] = JSON.parse(rawData);

      prodServList = parsed.map(item => ({
        clave: item.id,
        descripcion: item.descripcion || '',
        palabrasSimilares: item.palabrasSimilares || '',
        searchKey: normalizeText(`${item.id} ${item.descripcion} ${item.palabrasSimilares || ''}`)
      }));

      console.log(`✅ [SAT Catalog] ${prodServList.length} claves de productos y servicios cargadas en memoria.`);
    } else {
      console.warn('⚠️ [SAT Catalog] Archivo c_ClaveProdServ.json no encontrado en ninguna ruta candidata.');
    }

    if (unidadPath) {
      console.log(`📦 [SAT Catalog] Cargando catálogo completo c_ClaveUnidad desde: ${unidadPath}...`);
      const rawData = fs.readFileSync(unidadPath, 'utf8');
      const parsed: RawUnidad[] = JSON.parse(rawData);

      unidadList = parsed.map(item => ({
        clave: item.id,
        nombre: item.nombre || '',
        descripcion: item.descripcion || '',
        simbolo: item.simbolo || '',
        searchKey: normalizeText(`${item.id} ${item.nombre} ${item.descripcion || ''} ${item.simbolo || ''}`)
      }));

      console.log(`✅ [SAT Catalog] ${unidadList.length} claves de unidades cargadas en memoria.`);
    } else {
      console.warn('⚠️ [SAT Catalog] Archivo c_ClaveUnidad.json no encontrado en ninguna ruta candidata.');
    }

    isLoaded = true;
  } catch (error) {
    console.error('❌ [SAT Catalog] Error al cargar los catálogos del SAT en memoria:', error);
  }
}

// Iniciar carga inmediata
loadSatCatalogs();

export class SatController {
  /**
   * GET /api/sat/productos-servicios?q=...&limit=50
   * Busca en el catálogo de más de 52,000 claves del SAT en milisegundos.
   */
  static searchProductosServicios(req: Request, res: Response): void {
    try {
      if (!isLoaded) {
        loadSatCatalogs();
      }

      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
      const queryNorm = normalizeText(q);

      if (!queryNorm) {
        // Devolver primeros elementos más comunes
        const defaults = prodServList.slice(0, limit).map(p => ({
          clave: p.clave,
          descripcion: p.descripcion,
          palabrasSimilares: p.palabrasSimilares
        }));
        res.json({ total: prodServList.length, results: defaults });
        return;
      }

      const tokens = queryNorm.split(/\s+/).filter(Boolean);
      const exactMatches: IndexedProdServ[] = [];
      const prefixMatches: IndexedProdServ[] = [];
      const tokenMatches: IndexedProdServ[] = [];

      for (const item of prodServList) {
        // Coincidencia exacta de clave
        if (item.clave === queryNorm) {
          exactMatches.push(item);
          continue;
        }

        // Prefijo de clave (ej. "4322")
        if (item.clave.startsWith(queryNorm)) {
          prefixMatches.push(item);
          if (exactMatches.length + prefixMatches.length >= limit * 2) break;
          continue;
        }

        // Todos los tokens de búsqueda coinciden en la descripción o palabras clave
        const allTokensMatch = tokens.every(token => item.searchKey.includes(token));
        if (allTokensMatch) {
          tokenMatches.push(item);
          if (exactMatches.length + prefixMatches.length + tokenMatches.length >= limit * 2) break;
        }
      }

      const combined = [...exactMatches, ...prefixMatches, ...tokenMatches].slice(0, limit);

      res.json({
        totalCatalog: prodServList.length,
        count: combined.length,
        results: combined.map(p => ({
          clave: p.clave,
          descripcion: p.descripcion,
          palabrasSimilares: p.palabrasSimilares
        }))
      });
    } catch (error: any) {
      console.error('Error buscando productos/servicios SAT:', error);
      res.status(500).json({ error: 'Error al buscar en el catálogo del SAT' });
    }
  }

  /**
   * GET /api/sat/unidades?q=...&limit=50
   * Busca en el catálogo completo de 2,400+ unidades de medida del SAT.
   */
  static searchUnidades(req: Request, res: Response): void {
    try {
      if (!isLoaded) {
        loadSatCatalogs();
      }

      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
      const queryNorm = normalizeText(q);

      if (!queryNorm) {
        const defaults = unidadList.slice(0, limit).map(u => ({
          clave: u.clave,
          nombre: u.nombre,
          descripcion: u.descripcion,
          simbolo: u.simbolo
        }));
        res.json({ total: unidadList.length, results: defaults });
        return;
      }

      const tokens = queryNorm.split(/\s+/).filter(Boolean);
      const exactMatches: IndexedUnidad[] = [];
      const tokenMatches: IndexedUnidad[] = [];

      for (const item of unidadList) {
        if (item.clave.toLowerCase() === queryNorm) {
          exactMatches.push(item);
          continue;
        }

        const allTokensMatch = tokens.every(token => item.searchKey.includes(token));
        if (allTokensMatch) {
          tokenMatches.push(item);
          if (exactMatches.length + tokenMatches.length >= limit * 2) break;
        }
      }

      const combined = [...exactMatches, ...tokenMatches].slice(0, limit);

      res.json({
        totalCatalog: unidadList.length,
        count: combined.length,
        results: combined.map(u => ({
          clave: u.clave,
          nombre: u.nombre,
          descripcion: u.descripcion,
          simbolo: u.simbolo
        }))
      });
    } catch (error: any) {
      console.error('Error buscando unidades SAT:', error);
      res.status(500).json({ error: 'Error al buscar unidades del SAT' });
    }
  }

  /**
   * GET /api/sat/clave/:clave
   * Consulta directa de una clave específica.
   */
  static getClaveInfo(req: Request, res: Response): void {
    try {
      const clave = (typeof req.params.clave === 'string' ? req.params.clave : '').trim();
      const prod = prodServList.find(p => p.clave === clave);
      if (prod) {
        res.json({ tipo: 'producto', item: prod });
        return;
      }

      const unidad = unidadList.find(u => u.clave.toUpperCase() === clave.toUpperCase());
      if (unidad) {
        res.json({ tipo: 'unidad', item: unidad });
        return;
      }

      res.status(404).json({ error: 'Clave no encontrada en catálogo SAT' });
    } catch (error: any) {
      res.status(500).json({ error: 'Error consultando clave SAT' });
    }
  }
}
