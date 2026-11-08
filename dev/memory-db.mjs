// 本地开发用的内存数据库，模拟 Function 后端 SDK 的查询子集。
export function createMemoryDb() {
  const tables = new Map();
  const table = (name) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  };

  class Builder {
    constructor(name) {
      this.name = name;
      this.filters = [];
      this.op = null;
      this.payload = null;
      this.conflict = null;
      this.orderKey = null;
      this.orderAsc = true;
      this.limitN = null;
      this.wantSelect = false;
    }
    select() {
      this.wantSelect = true;
      return this;
    }
    eq(key, value) {
      this.filters.push([key, value]);
      return this;
    }
    order(key, { ascending = true } = {}) {
      this.orderKey = key;
      this.orderAsc = ascending;
      return this;
    }
    limit(n) {
      this.limitN = n;
      return this;
    }
    insert(payload) {
      this.op = "insert";
      this.payload = payload;
      return this;
    }
    insertIfAbsent(payload, { onConflict }) {
      this.op = "insertIfAbsent";
      this.payload = payload;
      this.conflict = onConflict.split(",");
      return this;
    }
    update(payload) {
      this.op = "update";
      this.payload = payload;
      return this;
    }
    matches(row) {
      return this.filters.every(([k, v]) => row[k] === v);
    }
    run() {
      const rows = table(this.name);
      if (this.op === "insert") {
        rows.push({ ...this.payload });
        return { data: this.wantSelect ? [{ ...this.payload }] : null, error: null };
      }
      if (this.op === "insertIfAbsent") {
        const exists = rows.some((r) => this.conflict.every((k) => r[k] === this.payload[k]));
        if (exists) return { data: [], error: null };
        rows.push({ ...this.payload });
        return { data: this.wantSelect ? [{ ...this.payload }] : null, error: null };
      }
      if (this.op === "update") {
        const touched = rows.filter((r) => this.matches(r));
        for (const row of touched) Object.assign(row, this.payload);
        return { data: this.wantSelect ? touched.map((r) => ({ ...r })) : null, error: null };
      }
      let out = rows.filter((r) => this.matches(r));
      if (this.orderKey) {
        out = [...out].sort((a, b) => (a[this.orderKey] < b[this.orderKey] ? -1 : 1) * (this.orderAsc ? 1 : -1));
      }
      if (this.limitN !== null) out = out.slice(0, this.limitN);
      return { data: out.map((r) => ({ ...r })), error: null };
    }
    then(resolve, reject) {
      try {
        resolve(this.run());
      } catch (error) {
        reject(error);
      }
    }
  }

  return { from: (name) => new Builder(name) };
}