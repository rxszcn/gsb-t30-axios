// 复现：参数序列化这一步失败时，冒出来的错误形态三家各异
import http from "node:http";
import axios from "../index.js";

const server = http.createServer((req, res) => res.end("ok"));

const circ = { self: null };
circ.self = circ;

server.listen(0, async () => {
  const url = `http://127.0.0.1:${server.address().port}/q`;
  for (const adapter of ["http", "fetch"]) {
    try {
      await axios.get(url, { adapter, params: circ, timeout: 3000 });
      console.log(adapter, "-> 没抛？");
    } catch (e) {
      console.log(adapter.padEnd(5), "循环引用: name=" + e.name, "| isAxiosError=" + !!e.isAxiosError, "| 有config=" + !!(e && e.config));
    }
    try {
      await axios.get(url, {
        adapter,
        params: { a: 1 },
        paramsSerializer: () => {
          throw new Error("序列化器自己炸了");
        },
        timeout: 3000,
      });
    } catch (e) {
      console.log("     自定义序列化器: name=" + e.name, "| code=" + e.code, "| isAxiosError=" + !!e.isAxiosError, "| 有config=" + !!(e && e.config));
    }
  }
  server.close();
});
