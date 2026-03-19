#!/usr/bin/env node
/**
 * PJE MCP Server - Versão MNI (SOAP) + BNP
 * Servidor MCP para integração com o PJE via Modelo Nacional de Interoperabilidade
 * e com o Banco Nacional de Precedentes (BNP) do CNJ
 *
 * Versão: 4.0.0
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError, } from "@modelcontextprotocol/sdk/types.js";
import * as dotenv from "dotenv";
import { PJEMNIClient } from "./client.js";
dotenv.config();
console.error("DEBUG ENV:", {
    username: process.env.PJE_USERNAME ? "SET" : "NOT SET",
    password: process.env.PJE_PASSWORD ? "SET" : "NOT SET",
    baseUrl: process.env.PJE_BASE_URL
});
// ============================================
// Servidor MCP
// ============================================
const pjeClient = new PJEMNIClient();
const server = new Server({
    name: "pje-mcp-server",
    version: "3.0.2",
}, {
    capabilities: {
        tools: {},
    },
});
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "pje_status",
                description: "Retorna o status atual da configuração do PJE MCP Server",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "pje_testar_conexao",
                description: "Testa a conexão com o serviço MNI do PJE",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "pje_consultar_processo",
                description: "Consulta um processo pelo número usando o MNI (Modelo Nacional de Interoperabilidade)",
                inputSchema: {
                    type: "object",
                    properties: {
                        numero: {
                            type: "string",
                            description: "Número do processo no formato CNJ (ex: 0000000-00.0000.0.00.0000)",
                        },
                        movimentos: {
                            type: "boolean",
                            description: "Incluir movimentações do processo (padrão: true)",
                        },
                        incluirCabecalho: {
                            type: "boolean",
                            description: "Incluir cabeçalho do processo (padrão: true)",
                        },
                        incluirDocumentos: {
                            type: "boolean",
                            description: "Incluir documentos do processo com conteúdo (padrão: false)",
                        },
                    },
                    required: ["numero"],
                },
            },
            {
                name: "pje_consultar_processo_profunda",
                description: "Consulta profunda de um processo, incluindo todos os documentos e metadados completos com conteúdo binário (base64)",
                inputSchema: {
                    type: "object",
                    properties: {
                        numero: {
                            type: "string",
                            description: "Número do processo no formato CNJ (ex: 0000000-00.0000.0.00.0000)",
                        },
                    },
                    required: ["numero"],
                },
            },
            {
                name: "pje_consultar_processo_por_cpf_cnpj",
                description: "Consulta processos de uma parte pelo CPF ou CNPJ",
                inputSchema: {
                    type: "object",
                    properties: {
                        documento: {
                            type: "string",
                            description: "CPF ou CNPJ da parte (com ou sem formatação)",
                        },
                        pagina: {
                            type: "number",
                            description: "Número da página (começa em 1)",
                        },
                        tamanhoPagina: {
                            type: "number",
                            description: "Quantidade de registros por página (padrão: 20)",
                        },
                    },
                    required: ["documento"],
                },
            },
            {
                name: "pje_consultar_processo_por_nome",
                description: "Consulta processos pelo nome da parte",
                inputSchema: {
                    type: "object",
                    properties: {
                        nome: {
                            type: "string",
                            description: "Nome da parte a ser pesquisada",
                        },
                        tipoParte: {
                            type: "string",
                            enum: ["AUTOR", "REU", "TODOS"],
                            description: "Tipo de parte (AUTOR, REU ou TODOS). Padrão: TODOS",
                        },
                        pagina: {
                            type: "number",
                            description: "Número da página (começa em 1)",
                        },
                        tamanhoPagina: {
                            type: "number",
                            description: "Quantidade de registros por página (padrão: 20)",
                        },
                    },
                    required: ["nome"],
                },
            },
            {
                name: "pje_consultar_conteudo_documento",
                description: "Consulta o conteúdo de um documento específico de um processo",
                inputSchema: {
                    type: "object",
                    properties: {
                        numeroProcesso: {
                            type: "string",
                            description: "Número do processo no formato CNJ",
                        },
                        idDocumento: {
                            type: "string",
                            description: "ID do documento a ser consultado",
                        },
                    },
                    required: ["numeroProcesso", "idDocumento"],
                },
            },
            {
                name: "pje_consultar_avisos",
                description: "Consulta avisos/intimações pendentes",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "pje_consultar_teor_comunicacao",
                description: "Consulta o teor de uma comunicação/intimação",
                inputSchema: {
                    type: "object",
                    properties: {
                        identificadorAviso: {
                            type: "string",
                            description: "Identificador do aviso/comunicação",
                        },
                    },
                    required: ["identificadorAviso"],
                },
            },
            {
                name: "pje_consultar_precedentes_bnp",
                description: "Consulta precedentes no Banco Nacional de Precedentes (BNP) do CNJ",
                inputSchema: {
                    type: "object",
                    properties: {
                        termo: {
                            type: "string",
                            description: "Termo de busca (palavras-chave, tema jurídico, etc.)",
                        },
                        tribunal: {
                            type: "string",
                            description: "Sigla do tribunal (ex: STF, STJ, TJBA, etc.)",
                        },
                        especie: {
                            type: "string",
                            description: "Espécie do precedente (ex: SUMULA, REPERCUSSAO_GERAL, RECURSO_REPETITIVO, etc.)",
                        },
                        dataInicio: {
                            type: "string",
                            description: "Data inicial do julgamento (formato: YYYY-MM-DD)",
                        },
                        dataFim: {
                            type: "string",
                            description: "Data final do julgamento (formato: YYYY-MM-DD)",
                        },
                        pagina: {
                            type: "number",
                            description: "Número da página (começa em 0)",
                        },
                        tamanhoPagina: {
                            type: "number",
                            description: "Quantidade de registros por página (padrão: 10)",
                        },
                    },
                    required: ["termo"],
                },
            },
            {
                name: "pje_listar_metodos",
                description: "Lista os métodos disponíveis no serviço MNI",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "pje_status": {
                const status = pjeClient.getStatus();
                return {
                    content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
                };
            }
            case "pje_testar_conexao": {
                const resultado = await pjeClient.testarConexao();
                return {
                    content: [{
                            type: "text",
                            text: resultado.sucesso ? `✅ ${resultado.mensagem}` : `❌ ${resultado.mensagem}`,
                        }],
                };
            }
            case "pje_consultar_processo": {
                const processo = await pjeClient.consultarProcesso(args?.numero, {
                    movimentos: args?.movimentos,
                    incluirCabecalho: args?.incluirCabecalho,
                    incluirDocumentos: args?.incluirDocumentos,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(processo, null, 2) }],
                };
            }
            case "pje_consultar_processo_profunda": {
                const processo = await pjeClient.consultarProcessoProfunda(args?.numero);
                return {
                    content: [{ type: "text", text: JSON.stringify(processo, null, 2) }],
                };
            }
            case "pje_consultar_processo_por_cpf_cnpj": {
                const processos = await pjeClient.consultarProcessoPorDocumento(args?.documento, {
                    pagina: args?.pagina,
                    tamanhoPagina: args?.tamanhoPagina,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(processos, null, 2) }],
                };
            }
            case "pje_consultar_processo_por_nome": {
                const processos = await pjeClient.consultarProcessoPorNome(args?.nome, {
                    tipoParte: args?.tipoParte,
                    pagina: args?.pagina,
                    tamanhoPagina: args?.tamanhoPagina,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(processos, null, 2) }],
                };
            }
            case "pje_consultar_conteudo_documento": {
                const documento = await pjeClient.consultarConteudoDocumento(args?.numeroProcesso, args?.idDocumento);
                return {
                    content: [{ type: "text", text: JSON.stringify(documento, null, 2) }],
                };
            }
            case "pje_consultar_avisos": {
                const avisos = await pjeClient.consultarAvisosPendentes();
                return {
                    content: [{ type: "text", text: JSON.stringify(avisos, null, 2) }],
                };
            }
            case "pje_consultar_teor_comunicacao": {
                const teor = await pjeClient.consultarTeorComunicacao(args?.identificadorAviso);
                return {
                    content: [{ type: "text", text: JSON.stringify(teor, null, 2) }],
                };
            }
            case "pje_consultar_precedentes_bnp": {
                const precedentes = await pjeClient.consultarPrecedentesBNP(args?.termo, {
                    tribunal: args?.tribunal,
                    especie: args?.especie,
                    dataInicio: args?.dataInicio,
                    dataFim: args?.dataFim,
                    pagina: args?.pagina,
                    tamanhoPagina: args?.tamanhoPagina,
                });
                return {
                    content: [{ type: "text", text: JSON.stringify(precedentes, null, 2) }],
                };
            }
            case "pje_listar_metodos": {
                const metodos = await pjeClient.listarMetodosDisponiveis();
                return {
                    content: [{
                            type: "text",
                            text: `Métodos disponíveis no MNI:\n${metodos.map(m => `- ${m}`).join('\n')}`,
                        }],
                };
            }
            default:
                throw new McpError(ErrorCode.MethodNotFound, `Ferramenta desconhecida: ${name}`);
        }
    }
    catch (error) {
        return {
            content: [{ type: "text", text: `❌ Erro: ${error.message}` }],
            isError: true,
        };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("🔐 PJE MCP Server (MNI/SOAP + BNP) v3.0.2 iniciado com sucesso!");
    console.error(`📌 PJE Endpoint: ${process.env.PJE_BASE_URL || "https://pje.tjba.jus.br"}`);
    console.error(`📌 BNP Endpoint: ${process.env.BNP_API_URL || "https://bnp-sempj.cloud.pje.jus.br"}`);
    console.error(`📌 Debug ativado - arquivos serão salvos em ./debug/`);
}
main().catch((error) => {
    console.error("Erro fatal:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map