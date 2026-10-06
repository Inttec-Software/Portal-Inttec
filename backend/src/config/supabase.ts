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
    if (conditions.length === 0) return { whereStr: '', params: [] };
    const params: any[] = [];
    const clauses = conditions.map((c, i) => {
      params.push(c.val);
      if (c.op === 'ilike') return `${c.col} ILIKE $${i + 1}`;
      if (c.op === 'in') return `${c.col} = ANY($${i + 1}::text[])`;
      if (c.op === 'or') {
        const parts = c.val.split(',');
        const orClauses = parts.map((p: string) => {
          const [col, op, val] = p.split('.');
          if (op === 'eq') return `${col} = '${val}'`;
          return p;
        });
        return `(${orClauses.join(' OR ')})`;
      }
      return `${c.col} = $${i + 1}`;
    });
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
    select(cols: string = '*') { this.action = 'select'; this.cols = cols; return this; }
    insert(payload: any) { this.action = 'insert'; this.payload = payload; return this; }
    update(payload: any) { this.action = 'update'; this.payload = payload; return this; }
    delete() { this.action = 'delete'; return this; }
    
    eq(col: string, val: any) { this.conditions.push({ col, op: 'eq', val }); return this; }
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
        const { whereStr, params } = buildWhere(this.conditions);
        let queryParams = [...params];

        if (this.action === 'select') {
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
          
          if (hasComplementos || hasDocsFirmados || hasDocumentos) {
            const { rows } = await pool.query(sql, queryParams);
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
            return resolve({ data: this.isSingle ? (rows[0] || null) : rows, error: null });
          }
        }

        if (this.action === 'select') {
          sql = `SELECT ${this.cols} FROM ${this.table} ${whereStr}`;
          if (this.orderCol) sql += ` ORDER BY ${this.orderCol} ${this.orderAsc ? 'ASC' : 'DESC'}`;
          if (this.limitCount) sql += ` LIMIT ${this.limitCount}`;
        } 
        else if (this.action === 'delete') {
          sql = `DELETE FROM ${this.table} ${whereStr} RETURNING *`;
        }
        else if (this.action === 'update') {
          const keys = Object.keys(this.payload);
          const setStr = keys.map((k, i) => `${k} = $${params.length + i + 1}`).join(', ');
          queryParams = [...params, ...keys.map(k => this.payload[k])];
          sql = `UPDATE ${this.table} SET ${setStr} ${whereStr} RETURNING *`;
        }
        else if (this.action === 'insert') {
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
          sql = `INSERT INTO ${this.table} (${colsStr}) VALUES ${valStrings.join(', ')} RETURNING *`;
        }

        const { rows } = await pool.query(sql, queryParams);
        const data = this.isSingle ? (rows.length > 0 ? rows[0] : null) : rows;
        resolve({ data, error: null });
      } catch (err: any) {
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
