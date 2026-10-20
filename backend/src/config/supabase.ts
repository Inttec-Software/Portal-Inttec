import { getDbPool } from './database';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const getSupabaseClient = (company: 'inttec' | 'daravisa', env: 'cloud' | 'test' = 'cloud'): any => {
  const pool = getDbPool(company, env);

  const getS3Client = () => new S3Client({
    region: (process.env.AWS_REGION || 'us-east-2').trim(),
    credentials: {
      accessKeyId: (process.env.AWS_ACCESS_KEY_ID || '').trim(),
      secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || '').trim()
    }
  });

  const getPublicUrl = (key: string) => {
    const bucketName = process.env.AWS_BUCKET_NAME || 'portal-inttec-storage';
    const region = process.env.AWS_REGION || 'us-east-2';
    return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
  };

  const buildWhere = (conditions: any[]) => {
    if (!conditions || conditions.length === 0) return { whereStr: '', params: [] };
    const params: any[] = [];
    const clauses: string[] = [];

    for (const c of conditions) {
      if (c.op === 'or') {
        const parts = String(c.val).split(',');
        const orClauses = parts.map((p: string) => {
          const [col, op, val] = p.split('.');
          if (op === 'eq') {
            params.push(val);
            return `${col} = $${params.length}`;
          }
          if (op === 'neq') {
            params.push(val);
            return `${col} != $${params.length}`;
          }
          if (op === 'ilike') {
            params.push(val);
            return `${col} ILIKE $${params.length}`;
          }
          return p;
        });
        clauses.push(`(${orClauses.join(' OR ')})`);
      } else if (c.op === 'ilike') {
        params.push(c.val);
        clauses.push(`${c.col} ILIKE $${params.length}`);
      } else if (c.op === 'in') {
        params.push(c.val);
        clauses.push(`${c.col} = ANY($${params.length}::text[])`);
      } else if (c.op === 'neq') {
        params.push(c.val);
        clauses.push(`${c.col} != $${params.length}`);
      } else if (c.op === 'not') {
        if (c.val && c.val.subOp === 'is' && (c.val.val === null || c.val.val === 'null')) {
          clauses.push(`${c.col} IS NOT NULL`);
        } else if (c.val && c.val.subOp === 'eq') {
          params.push(c.val.val);
          clauses.push(`${c.col} != $${params.length}`);
        } else {
          params.push(c.val);
          clauses.push(`NOT (${c.col} = $${params.length})`);
        }
      } else if (c.op === 'is') {
        if (c.val === null || c.val === 'null') {
          clauses.push(`${c.col} IS NULL`);
        } else {
          params.push(c.val);
          clauses.push(`${c.col} = $${params.length}`);
        }
      } else {
        params.push(c.val);
        clauses.push(`${c.col} = $${params.length}`);
      }
    }

    return { whereStr: `WHERE ${clauses.join(' AND ')}`, params };
  };

  class QueryBuilder {
    table: string;
    action: 'select' | 'insert' | 'update' | 'delete' = 'select';
    cols: string = '*';
    conditions: any[] = [];
    payload: any = null;
    limitCount: number | null = null;
    isSingle: boolean = false;
    orderCol: string | null = null;
    orderAsc: boolean = true;

    constructor(table: string) {
      this.table = table;
    }
    select(cols: string = '*') {
      // Si ya se definió insert, update o delete, select() define las columnas devueltas (RETURNING)
      if (this.action === 'insert' || this.action === 'update' || this.action === 'delete') {
        this.cols = cols;
        return this;
      }
      this.action = 'select';
      this.cols = cols;
      return this;
    }
    insert(payload: any) { this.action = 'insert'; this.payload = payload; return this; }
    update(payload: any) { this.action = 'update'; this.payload = payload; return this; }
    delete() { this.action = 'delete'; return this; }

    eq(col: string, val: any) { this.conditions.push({ col, op: 'eq', val }); return this; }
    neq(col: string, val: any) { this.conditions.push({ col, op: 'neq', val }); return this; }
    not(col: string, op: string, val: any) { this.conditions.push({ col, op: 'not', val: { subOp: op, val } }); return this; }
    is(col: string, val: any) { this.conditions.push({ col, op: 'is', val }); return this; }
    ilike(col: string, val: any) { this.conditions.push({ col, op: 'ilike', val }); return this; }
    in(col: string, val: any[]) { this.conditions.push({ col, op: 'in', val }); return this; }
    or(val: string) { this.conditions.push({ col: '', op: 'or', val }); return this; }

    limit(count: number) { this.limitCount = count; return this; }
    maybeSingle() { this.isSingle = true; this.limitCount = 1; return this; }
    single() { this.isSingle = true; this.limitCount = 1; return this; }
    order(col: string, opts: { ascending?: boolean } = {}) { this.orderCol = col; this.orderAsc = opts.ascending ?? true; return this; }

    async then(resolve: any, reject: any) {
      try {
        let sql = '';
        let queryParams: any[] = [];

        if (this.action === 'select') {
          const { whereStr, params } = buildWhere(this.conditions);
          queryParams = [...params];

          let hasComplementos = this.cols.includes('complementos_pago_doctos(*)');
          let hasDocsFirmados = this.cols.includes('documentos_firmados(id, estado)');
          let hasDocumentos = this.cols.includes('documentos(*)');

          let selStr = this.cols
            .replace(', complementos_pago_doctos(*)', '')
            .replace(', documentos_firmados(id, estado)', '')
            .replace(', documentos(*)', '');

          sql = `SELECT ${selStr} FROM ${this.table} ${whereStr}`;
          if (this.orderCol) sql += ` ORDER BY ${this.orderCol} ${this.orderAsc ? 'ASC' : 'DESC'}`;
          if (this.limitCount) sql += ` LIMIT ${this.limitCount}`;

          const { rows } = await pool.query(sql, queryParams);

          if (hasComplementos || hasDocsFirmados || hasDocumentos) {
            for (const r of rows) {
              if (hasComplementos) {
                const { rows: docs } = await pool.query(`SELECT * FROM complementos_pago_doctos WHERE complemento_pago_id = $1`, [r.id]);
                r.complementos_pago_doctos = docs;
              }
              if (hasDocsFirmados) {
                const { rows: docs } = await pool.query(`SELECT id, estado FROM documentos_firmados WHERE documento_id = $1`, [r.id]);
                r.documentos_firmados = docs;
              }
              if (hasDocumentos) {
                const { rows: docs } = await pool.query(`SELECT * FROM documentos WHERE id = $1`, [r.documento_id]);
                r.documentos = docs[0] || null;
              }
            }
          }
          const data = this.isSingle ? (rows.length > 0 ? rows[0] : null) : rows;
          return resolve({ data, error: null });
        } else if (this.action === 'delete') {
          const { whereStr, params } = buildWhere(this.conditions);
          queryParams = [...params];
          const returningCols = (this.cols && this.cols !== '*' && !this.cols.includes('(')) ? this.cols : '*';
          sql = `DELETE FROM ${this.table} ${whereStr} RETURNING ${returningCols}`;
        } else if (this.action === 'update') {
          const keys = Object.keys(this.payload || {});
          if (keys.length === 0) return resolve({ data: this.isSingle ? null : [], error: null });
          queryParams = [];
          const setClauses: string[] = [];
          for (const k of keys) {
            queryParams.push(this.payload[k]);
            setClauses.push(`${k} = $${queryParams.length}`);
          }
          const whereClauses: string[] = [];
          for (const c of this.conditions) {
            if (c.op === 'eq') {
              queryParams.push(c.val);
              whereClauses.push(`${c.col} = $${queryParams.length}`);
            } else if (c.op === 'neq') {
              queryParams.push(c.val);
              whereClauses.push(`${c.col} != $${queryParams.length}`);
            } else if (c.op === 'ilike') {
              queryParams.push(c.val);
              whereClauses.push(`${c.col} ILIKE $${queryParams.length}`);
            } else if (c.op === 'in') {
              queryParams.push(c.val);
              whereClauses.push(`${c.col} = ANY($${queryParams.length}::text[])`);
            } else if (c.op === 'is') {
              if (c.val === null || c.val === 'null') {
                whereClauses.push(`${c.col} IS NULL`);
              } else {
                queryParams.push(c.val);
                whereClauses.push(`${c.col} = $${queryParams.length}`);
              }
            } else if (c.op === 'not') {
              if (c.val && c.val.subOp === 'is' && (c.val.val === null || c.val.val === 'null')) {
                whereClauses.push(`${c.col} IS NOT NULL`);
              } else if (c.val && c.val.subOp === 'eq') {
                queryParams.push(c.val.val);
                whereClauses.push(`${c.col} != $${queryParams.length}`);
              } else {
                queryParams.push(c.val);
                whereClauses.push(`NOT (${c.col} = $${queryParams.length})`);
              }
            } else {
              queryParams.push(c.val);
              whereClauses.push(`${c.col} = $${queryParams.length}`);
            }
          }
          const whereClauseStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
          const returningCols = (this.cols && this.cols !== '*' && !this.cols.includes('(')) ? this.cols : '*';
          sql = `UPDATE ${this.table} SET ${setClauses.join(', ')} ${whereClauseStr} RETURNING ${returningCols}`;
        } else if (this.action === 'insert') {
          const isArray = Array.isArray(this.payload);
          const items = isArray ? this.payload : [this.payload];
          if (items.length === 0) return resolve({ data: [], error: null });

          const keys = Object.keys(items[0]);
          const colsStr = keys.join(', ');

          const valStrings = [];
          queryParams = [];
          for (let i = 0; i < items.length; i++) {
            const rowVals = [];
            for (const k of keys) {
              queryParams.push(items[i][k]);
              rowVals.push(`$${queryParams.length}`);
            }
            valStrings.push(`(${rowVals.join(', ')})`);
          }
          const returningCols = (this.cols && this.cols !== '*' && !this.cols.includes('(')) ? this.cols : '*';
          sql = `INSERT INTO ${this.table} (${colsStr}) VALUES ${valStrings.join(', ')} RETURNING ${returningCols}`;
        }

        const { rows } = await pool.query(sql, queryParams);
        const data = this.isSingle ? (rows.length > 0 ? rows[0] : null) : rows;
        resolve({ data, error: null });
      } catch (err: any) {
        console.error(`[DB QueryBuilder Error] in ${this.action} on ${this.table}:`, err.message);
        resolve({ data: null, error: { message: err.message, code: err.code } });
      }
    }
  }

  return {
    from: (table: string) => new QueryBuilder(table),
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => {
          return { data: { publicUrl: getPublicUrl(`${company}/${bucket}/${path}`) } };
        },
        upload: async (path: string, file: any, opts: any) => {
          try {
            const buffer = Buffer.isBuffer(file) ? file : Buffer.from(file);
            const key = `${company}/${bucket}/${path}`;
            const bucketName = process.env.AWS_BUCKET_NAME || 'portal-inttec-storage';
            
            const command = new PutObjectCommand({
              Bucket: bucketName,
              Key: key,
              Body: buffer,
              ContentType: opts?.contentType || 'application/octet-stream'
            });
            await getS3Client().send(command);
            return { data: { path }, error: null };
          } catch (err) {
            return { data: null, error: err };
          }
        },
        download: async (path: string) => {
           return { data: null, error: new Error('Download not implemented in shim') };
        }
      })
    }
  };
};
