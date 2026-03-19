#!/usr/bin/env node

/**
 * PJE MNI Dev Server - Servidor HTTP para testes em ambiente de desenvolvimento
 * Expõe as funcionalidades do MNI via REST API + frontend web
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PJEMNIClient } from "./client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.DEV_PORT || "3000", 10);
const client = new PJEMNIClient();

function jsonResponse(res: http.ServerResponse, data: any, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data, null, 2));
}

function errorResponse(res: http.ServerResponse, message: string, status = 500) {
  jsonResponse(res, { erro: true, mensagem: message }, status);
}

async function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("JSON inválido no body"));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(res: http.ServerResponse, filePath: string) {
  const ext = path.extname(filePath);
  const mimeTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  try {
    // ---- API Routes ----

    if (pathname === "/api/status" && req.method === "GET") {
      jsonResponse(res, client.getStatus());
      return;
    }

    if (pathname === "/api/credenciais" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.username || !body.password) {
        errorResponse(res, "username e password são obrigatórios", 400);
        return;
      }
      client.updateCredentials(body.username, body.password);
      if (body.baseUrl) {
        client.updateEndpoint(body.baseUrl);
      }
      jsonResponse(res, { sucesso: true, mensagem: "Credenciais atualizadas", status: client.getStatus() });
      return;
    }

    if (pathname === "/api/testar-conexao" && req.method === "POST") {
      const result = await client.testarConexao();
      jsonResponse(res, result);
      return;
    }

    if (pathname === "/api/listar-metodos" && req.method === "GET") {
      const metodos = await client.listarMetodosDisponiveis();
      jsonResponse(res, { metodos });
      return;
    }

    if (pathname === "/api/consultar-processo" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.numero) {
        errorResponse(res, "numero é obrigatório", 400);
        return;
      }
      const processo = await client.consultarProcesso(body.numero, {
        movimentos: body.movimentos ?? true,
        incluirCabecalho: body.incluirCabecalho ?? true,
        incluirDocumentos: body.incluirDocumentos ?? false,
      });
      jsonResponse(res, processo);
      return;
    }

    if (pathname === "/api/consultar-processo-profunda" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.numero) {
        errorResponse(res, "numero é obrigatório", 400);
        return;
      }
      const processo = await client.consultarProcessoProfunda(body.numero);
      jsonResponse(res, processo);
      return;
    }

    if (pathname === "/api/consultar-por-documento" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.documento) {
        errorResponse(res, "documento é obrigatório", 400);
        return;
      }
      const processos = await client.consultarProcessoPorDocumento(body.documento, {
        pagina: body.pagina,
        tamanhoPagina: body.tamanhoPagina,
      });
      jsonResponse(res, { processos });
      return;
    }

    if (pathname === "/api/consultar-por-nome" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.nome) {
        errorResponse(res, "nome é obrigatório", 400);
        return;
      }
      const processos = await client.consultarProcessoPorNome(body.nome, {
        tipoParte: body.tipoParte,
        pagina: body.pagina,
        tamanhoPagina: body.tamanhoPagina,
      });
      jsonResponse(res, { processos });
      return;
    }

    if (pathname === "/api/consultar-documento" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.numeroProcesso || !body.idDocumento) {
        errorResponse(res, "numeroProcesso e idDocumento são obrigatórios", 400);
        return;
      }
      const documento = await client.consultarConteudoDocumento(body.numeroProcesso, body.idDocumento);
      jsonResponse(res, documento);
      return;
    }

    if (pathname === "/api/consultar-avisos" && req.method === "POST") {
      const avisos = await client.consultarAvisosPendentes();
      jsonResponse(res, { avisos });
      return;
    }

    if (pathname === "/api/consultar-teor-comunicacao" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.identificadorAviso) {
        errorResponse(res, "identificadorAviso é obrigatório", 400);
        return;
      }
      const teor = await client.consultarTeorComunicacao(body.identificadorAviso);
      jsonResponse(res, teor);
      return;
    }

    if (pathname === "/api/consultar-precedentes" && req.method === "POST") {
      const body = await parseBody(req);
      if (!body.termo) {
        errorResponse(res, "termo é obrigatório", 400);
        return;
      }
      const precedentes = await client.consultarPrecedentesBNP(body.termo, {
        tribunal: body.tribunal,
        especie: body.especie,
        dataInicio: body.dataInicio,
        dataFim: body.dataFim,
        pagina: body.pagina,
        tamanhoPagina: body.tamanhoPagina,
      });
      jsonResponse(res, { precedentes });
      return;
    }

    // ---- Static Files ----
    if (pathname === "/" || pathname === "/index.html") {
      serveStatic(res, path.join(__dirname, "..", "public", "index.html"));
      return;
    }

    const staticPath = path.join(__dirname, "..", "public", pathname);
    if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
      serveStatic(res, staticPath);
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (error: any) {
    console.error(`[DEV-SERVER] Erro: ${error.message}`);
    errorResponse(res, error.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  PJE MNI Dev Server v4.0`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`========================================`);
  console.log(`\nEndpoints da API:`);
  console.log(`  GET  /api/status`);
  console.log(`  POST /api/credenciais`);
  console.log(`  POST /api/testar-conexao`);
  console.log(`  GET  /api/listar-metodos`);
  console.log(`  POST /api/consultar-processo`);
  console.log(`  POST /api/consultar-processo-profunda`);
  console.log(`  POST /api/consultar-por-documento`);
  console.log(`  POST /api/consultar-por-nome`);
  console.log(`  POST /api/consultar-documento`);
  console.log(`  POST /api/consultar-avisos`);
  console.log(`  POST /api/consultar-teor-comunicacao`);
  console.log(`  POST /api/consultar-precedentes`);
  console.log(`\nFrontend: http://localhost:${PORT}/`);
  console.log(`\nConfigure suas credenciais no painel web ou via .env\n`);
});
