import { Request, Response } from 'express';
import { getDbPool } from '../../config/database';

// === GET /api/auditoria/gastos ===
export const getGastosParaAuditoria = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { tarjeta, metodoPago, minDate, maxDate, status } = req.query;

    let sql = `
      SELECT 
        g.*,
        CASE WHEN s.id IS NOT NULL THEN json_build_object(
          'id', s.id, 
          'nombre', s.nombre, 
          'categoria_id', s.categoria_id, 
          'categorias', json_build_object('id', c.id, 'nombre', c.nombre)
        ) ELSE null END as subcategoria_rel,
        CASE WHEN p.id IS NOT NULL THEN json_build_object('id', p.id, 'nombre', p.nombre) ELSE null END as proveedor_rel,
        CASE WHEN cl.id IS NOT NULL THEN json_build_object('id', cl.id, 'nombre', cl.nombre) ELSE null END as cliente_rel,
        CASE WHEN sc.id IS NOT NULL THEN json_build_object('id', sc.id, 'nombre', sc.nombre) ELSE null END as sucursal_rel
      FROM gastos g
      LEFT JOIN subcategorias s ON g.subcategoria_id = s.id
      LEFT JOIN categorias c ON s.categoria_id = c.id
      LEFT JOIN proveedores p ON g.proveedor_id = p.id
      LEFT JOIN clientes cl ON g.cliente_id = cl.id
      LEFT JOIN sucursales_cliente sc ON g.sucursal_id = sc.id
      WHERE 1=1
    `;
    const values: any[] = [];
    let pIdx = 1;

    // Filtro de estatus (Por defecto APPROVED y PENDING para auditoría)
    if (status === 'APPROVED') {
      sql += ` AND g.status = 'APPROVED'`;
    } else if (status === 'PENDING') {
      sql += ` AND g.status = 'PENDING'`;
    } else if (status === 'ALL') {
      sql += ` AND g.status IN ('APPROVED', 'PENDING', 'ACTION_REQUIRED')`;
    } else {
      sql += ` AND g.status IN ('APPROVED', 'PENDING')`;
    }

    // Filtro de tarjeta
    if (tarjeta && tarjeta !== 'TODAS') {
      const tarjetaStr = String(tarjeta);
      if (tarjetaStr.includes(',')) {
        const list = tarjetaStr.split(',').map(t => t.trim());
        sql += ` AND g.tipo_tarjeta = ANY($${pIdx})`;
        values.push(list);
        pIdx++;
      } else {
        sql += ` AND g.tipo_tarjeta = $${pIdx}`;
        values.push(tarjetaStr);
        pIdx++;
      }
    }

    // Filtro de fechas con rango (usando fecha_comprobante o created_at como respaldo)
    if (minDate) {
      sql += ` AND COALESCE(g.fecha_comprobante::date, g.created_at::date) >= $${pIdx}::date`;
      values.push(minDate);
      pIdx++;
    }
    if (maxDate) {
      sql += ` AND COALESCE(g.fecha_comprobante::date, g.created_at::date) <= $${pIdx}::date`;
      values.push(maxDate);
      pIdx++;
    }

    // Filtro de método de pago
    if (metodoPago && metodoPago !== 'tarjeta' && metodoPago !== 'todas') {
      sql += ` AND g.metodo_pago = $${pIdx}`;
      values.push(metodoPago);
      pIdx++;
    } else {
      sql += ` AND g.metodo_pago IN ('tarjeta', 'tarjeta_credito', 'tarjeta_debito')`;
    }

    sql += ` ORDER BY g.fecha_comprobante DESC, g.created_at DESC`;

    const { rows } = await pool.query(sql, values);
    return res.json({ gastos: rows || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/auditoria ===
export const guardarAuditoria = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const auditoria = req.body;
    const keys = Object.keys(auditoria);
    const values = Object.values(auditoria);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const { rows } = await pool.query(
      `INSERT INTO auditorias_tarjeta (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === GET /api/auditoria ===
export const obtenerAuditorias = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { tarjeta } = req.query;
    
    let sql = `SELECT * FROM auditorias_tarjeta`;
    const values: any[] = [];

    if (tarjeta && tarjeta !== 'TODAS') {
      sql += ` WHERE tarjeta = $1`;
      values.push(tarjeta);
    }
    
    sql += ` ORDER BY creado_en DESC`;

    const { rows } = await pool.query(sql, values);
    return res.json({ auditorias: rows || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === DELETE /api/auditoria/:id ===
export const eliminarAuditoria = async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) return res.status(400).json({ error: 'Tenant no especificado' });
    const pool = getDbPool(tenant.company, tenant.env);

    const { id } = req.params;

    await pool.query(`DELETE FROM auditorias_tarjeta WHERE id = $1`, [id]);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
};

// === POST /api/auditoria/ocr-imagen ===
export const procesarImagenMovimientos = async (req: Request, res: Response) => {
  try {
    const { base64Image } = req.body;
    if (!base64Image) {
      return res.status(400).json({ error: 'Falta la imagen en base64' });
    }

    const cleanBase64 = base64Image.replace(/^data:[a-zA-Z0-9/\-+.]+;base64,/, '').replace(/[\r\n\s]/g, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('spa');
    const ret = await worker.recognize(buffer);
    await worker.terminate();

    const text = ret?.data?.text || '';
    const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

    const meses: { [key: string]: string } = {
      ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
      jul: '07', ago: '08', sep: '09', set: '09', oct: '10', nov: '11', dic: '12',
      enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
      julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
    };

    const extractDateFromText = (str: string): string | null => {
      const clean = str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const currYear = new Date().getFullYear();

      if (/^(hoy)\b/i.test(clean)) {
        return new Date().toISOString().split('T')[0];
      }
      if (/^(ayer)\b/i.test(clean)) {
        return new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
      }

      // Formato ISO: YYYY-MM-DD o YYYY/MM/DD
      const isoMatch = clean.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
      if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
      }

      // Formato numérico: DD/MM/YYYY o DD-MM-YYYY o DD/MM/YY
      const numMatch = clean.match(/\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-](\d{2,4})\b/);
      if (numMatch) {
        const day = numMatch[1].padStart(2, '0');
        const month = numMatch[2].padStart(2, '0');
        let year = numMatch[3];
        if (year.length === 2) year = '20' + year;
        return `${year}-${month}-${day}`;
      }

      // Formato texto: "26 de octubre", "26 oct 2026", "26 oct."
      const txtRegex = /\b(0?[1-9]|[12]\d|3[01])\s*(?:de|del|\-|\.)?\s*([a-z]{3,10})(?:\.?\s*(?:de|del|\-|\,)?\s*(20\d{2}|\d{2}))?\b/i;
      const dMatch = clean.match(txtRegex);
      if (dMatch) {
        const day = dMatch[1].padStart(2, '0');
        const mesTxt = dMatch[2];
        const mes = meses[mesTxt] || meses[mesTxt.substring(0, 3)];
        if (mes) {
          let year = dMatch[3] || String(currYear);
          if (year.length === 2) year = '20' + year;
          return `${year}-${mes}-${day}`;
        }
      }

      return null;
    };

    const isGenericStatusOrHeader = (str: string): boolean => {
      const s = str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim();
      if (!s || s.length < 2) return true;
      if (/^\d{1,2}:\d{2}/.test(str.trim())) return true; // Solo hora
      const genericPhrases = [
        'compra con tarjeta',
        'compra tarjeta',
        'consumo tarjeta',
        'en transito',
        'financiable',
        'tarjeta digital',
        'tarjeta fisica',
        'tarjeta de credito',
        'tarjeta de debito',
        'movimientos',
        'detalle de movimientos',
        'ultimos movimientos',
        'cargo',
        'pagado',
        'pendiente',
        'autorizado',
        'comercio',
      ];
      return genericPhrases.includes(s);
    };

    const isSummaryOrCreditLine = (str: string): boolean => {
      const s = str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (/\+\s*\$|\$\s*\+/.test(s)) return true; // +$ es abono
      const ignoreKeywords = [
        'devolucion',
        'abono',
        'su pago',
        'pago recibido',
        'bonificacion',
        'saldo disponible',
        'saldo actual',
        'saldo al corte',
        'limite de credito',
        'credito disponible',
        'pago minimo',
        'no generar intereses',
        'total de cargos',
        'fecha de corte',
        'fecha limite',
      ];
      return ignoreKeywords.some(k => s.includes(k));
    };

    // No inventar la fecha de hoy si la captura no muestra ninguna fecha;
    // solo asignar fecha cuando realmente se detecte en la imagen.
    let currentDate = '';
    const movimientos: any[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 1. Verificar si la línea contiene una fecha (con o sin monto)
      const detectedDate = extractDateFromText(line);
      if (detectedDate) {
        currentDate = detectedDate;
      }

      // Ignorar abonos, pagos a la tarjeta o saldos de resumen
      if (isSummaryOrCreditLine(line)) {
        continue;
      }

      // 2. Detectar monto en la línea:
      // Caso A: Con símbolo $ (incluyendo -$938.00 o - $ 938.00 que usan bancos como BBVA para cargos)
      // Caso B: Cuando el OCR lee '$' como 'S' antes de números (ej. -S 938.00 o S938.00)
      // Caso C: Número con decimales .XX al final de la línea (ej. 938.00 o 1,786.11 MXN)
      const amountMatch =
        line.match(/(?:-\s*)?\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/) ||
        line.match(/(?:^|\s|-)\s*S\s*([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}|[0-9]+\.[0-9]{2})\b/) ||
        line.match(/(?:^|\s|-)\s*([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}|[0-9]{2,6}\.[0-9]{2})\s*(?:MXN|MN|pesos)?\s*$/i);

      if (amountMatch) {
        const rawAmount = amountMatch[1].replace(/,/g, '');
        const montoNum = parseFloat(rawAmount);
        if (isNaN(montoNum) || montoNum <= 0) continue;

        // Extraer descripción de la misma línea quitando el monto y posibles fechas
        const matchIndex = amountMatch.index ?? line.indexOf(amountMatch[0]);
        let desc = line.substring(0, matchIndex).trim();

        // Limpiar fechas al inicio de la descripción si estaban en la misma línea
        desc = desc
          .replace(/^\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-](\d{2,4})\b\s*/i, '')
          .replace(/^\b(0?[1-9]|[12]\d|3[01])\s*(?:de|del|\-|\.)?\s*[a-záéíóúñ]{3,10}(?:\.?\s*(?:de|del|\-|\,)?\s*\d{2,4})?\s*/i, '')
          .replace(/^[<>\-•*|+$]+\s*/, '')
          .replace(/\s*[-•*|]+$/, '')
          .trim();

        // Si la descripción en la misma línea está vacía o es genérica ("Compra tarjeta", "En tránsito"),
        // buscar en las líneas superiores inmediatas el nombre real del establecimiento
        if (!desc || isGenericStatusOrHeader(desc)) {
          for (let lookback = 1; lookback <= 3; lookback++) {
            const prevIdx = i - lookback;
            if (prevIdx < 0) break;
            const prevLine = lines[prevIdx]
              .replace(/^[<>\-•*|]+\s*/, '')
              .trim();

            // Si la línea anterior tiene otro monto, no cruzar al movimiento anterior
            if (/\$\s*[0-9]/.test(prevLine) || /[0-9]+\.[0-9]{2}\s*$/.test(prevLine)) {
              break;
            }
            // Si la línea anterior es solo una fecha, seguir buscando una línea más arriba
            if (extractDateFromText(prevLine) && prevLine.length <= 22) {
              continue;
            }
            if (!isGenericStatusOrHeader(prevLine) && !isSummaryOrCreditLine(prevLine)) {
              desc = prevLine;
              break;
            }
          }
        }

        if (!desc || isGenericStatusOrHeader(desc)) {
          desc = 'Cargo en tarjeta';
        }

        movimientos.push({
          id: `ocr_${movimientos.length}_${Date.now()}`,
          fecha: currentDate,
          descripcion: desc,
          monto: montoNum,
          tipo: 'cargo'
        });
      }
    }

    return res.json({ success: true, movimientos, rawText: text });
  } catch (error: any) {
    console.error('Error en procesarImagenMovimientos:', error);
    return res.status(500).json({ error: error.message || 'Error al procesar la imagen' });
  }
};
