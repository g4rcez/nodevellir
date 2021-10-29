import { Cookies } from "./middlewares/cookies";
import { Nodevellir } from ".";
import { Static } from "./middlewares/static";
import { readFileSync } from "fs";
import { CSP } from "./middlewares/security/csp";
import { HttpStatusCode } from "./typings/http-status-code";

const server = Nodevellir();

const proxy = server.createProxy();

proxy.register([
  {
    host: "http://localhost:9801",
    from: { path: "/post-test/:id/test", method: "get" },
    to: { path: "/posts/:id", method: "get", rewrite: "^/post-test/:id/test" },
  },
  {
    host: "http://localhost:9801",
    from: { path: "/testing*", method: "get" },
    to: { path: "/posts/", method: "get" },
  },
]);

server.listen(3000, () => console.log(":3000"));

server.get("/ids/:id", (req, res) => res.json(200, { message: "hello world", id: req.urlParams.id, query: req.qs }));

const staticMiddleware = Static("./server");

const cookieMiddleware = Cookies();

server
  .post("/new", (req, res) => {
    res.json(200, { message: "hello world" });
  })
  .get("/package-json", cookieMiddleware, (_, res) => {
    res.file(200, "application/json", readFileSync("./package.json"));
  })
  .get("/index", CSP(), cookieMiddleware, (req, res) => {
    res.setCookie("Authorization", "code");
    res.page(200, `<html><body><h1>Cookies<div>${JSON.stringify(req.cookies)}</div></h1></body></html>`);
  })
  .use("/static", staticMiddleware);

setTimeout(() => {
  server.get("/", (_req, res) => res.json(HttpStatusCode.Ok, { root: true }));
}, 10000);
