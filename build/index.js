#!/usr/bin/env node
/**
 * PJE MCP Server - Versão MNI (SOAP) + BNP
 * Servidor MCP para integração com o PJE via Modelo Nacional de Interoperabilidade
 * e com o Banco Nacional de Precedentes (BNP) do CNJ
 *
 * Versão: 3.0.0
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ErrorCode, McpError, } from "@modelcontextprotocol/sdk/types.js";
import * as soap from "soap";
import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config();
console.error("DEBUG ENV:", {
    username: process.env.PJE_USERNAME ? "SET" : "NOT SET",
    password: process.env.PJE_PASSWORD ? "SET" : "NOT SET",
    baseUrl: process.env.PJE_BASE_URL
});
// ============================================
// Classe Principal do Cliente PJE MNI
// ============================================
class PJEMNIClient {
    config;
    soapClientConsulta = null;
    soapClientIntercomunicacao = null;
    constructor() {
        this.config = this.loadConfig();
    }
    loadConfig() {
        const baseUrl = process.env.PJE_BASE_URL || "https://pje.tjba.jus.br";
        return {
            baseUrl,
            wsdlConsulta: `${baseUrl}/pje/ConsultaPJe?wsdl`,
            wsdlIntercomunicacao: `${baseUrl}/pje/intercomunicacao?wsdl`,
            username: process.env.PJE_USERNAME || "",
            password: process.env.PJE_PASSWORD || "",
            debug: process.env.PJE_DEBUG === "true",
            bnpApiUrl: process.env.BNP_API_URL || "https://bnp-sempj.cloud.pje.jus.br",
        };
    }
    async getConsultaClient() {
        if (!this.soapClientConsulta) {
            this.log(`Conectando ao WSDL: ${this.config.wsdlConsulta}`);
            this.soapClientConsulta = await soap.createClientAsync(this.config.wsdlConsulta, {
                wsdl_options: {
                    timeout: 30000,
                },
            });
        }
        return this.soapClientConsulta;
    }
    async getIntercomunicacaoClient() {
        if (!this.soapClientIntercomunicacao) {
            this.log(`Conectando ao WSDL: ${this.config.wsdlIntercomunicacao}`);
            this.soapClientIntercomunicacao = await soap.createClientAsync(this.config.wsdlIntercomunicacao, {
                wsdl_options: {
                    timeout: 30000,
                },
            });
        }
        return this.soapClientIntercomunicacao;
    }
    validateCredentials() {
        if (!this.config.username || !this.config.password) {
            throw new Error("Usuário e senha não configurados. Verifique o arquivo .env");
        }
    }
    // ============================================
    // Métodos de Conexão e Status
    // ============================================
    async testarConexao() {
        this.validateCredentials();
        try {
            const client = await this.getIntercomunicacaoClient();
            const methods = Object.keys(client).filter(k => !k.startsWith('_') && typeof client[k] === 'function');
            return {
                sucesso: true,
                mensagem: `Conexão estabelecida! Métodos disponíveis: ${methods.join(', ')}`,
            };
        }
        catch (error) {
            return {
                sucesso: false,
                mensagem: `Erro na conexão: ${error.message}`,
            };
        }
    }
    getStatus() {
        return {
            baseUrl: this.config.baseUrl,
            wsdlConsulta: this.config.wsdlConsulta,
            wsdlIntercomunicacao: this.config.wsdlIntercomunicacao,
            bnpApiUrl: this.config.bnpApiUrl,
            credenciaisConfiguradas: !!(this.config.username && this.config.password),
            username: this.config.username ? this.config.username.substring(0, 3) + '***' : 'NÃO CONFIGURADO',
        };
    }
    async listarMetodosDisponiveis() {
        try {
            const client = await this.getIntercomunicacaoClient();
            const methods = Object.keys(client).filter(k => !k.startsWith('_') &&
                typeof client[k] === 'function' &&
                !k.endsWith('Async'));
            return methods;
        }
        catch (error) {
            throw new Error(`Erro ao listar métodos: ${error.message}`);
        }
    }
    // ============================================
    // Consulta de Processo (Básica)
    // ============================================
    async consultarProcesso(numeroProcesso, opcoes) {
        this.validateCredentials();
        const client = await this.getIntercomunicacaoClient();
        const params = {
            idConsultante: this.config.username,
            senhaConsultante: this.config.password,
            numeroProcesso: numeroProcesso,
            movimentos: opcoes?.movimentos ?? true,
            incluirCabecalho: opcoes?.incluirCabecalho ?? true,
            incluirDocumentos: opcoes?.incluirDocumentos ?? false,
        };
        this.log(`Consultando processo: ${numeroProcesso}`);
        try {
            const [result] = await client.consultarProcessoAsync(params);
            if (result.sucesso === false || result.mensagem?.includes('erro')) {
                throw new Error(result.mensagem || 'Erro ao consultar processo');
            }
            return this.parseProcessoResponse(result, numeroProcesso);
        }
        catch (error) {
            if (error.message.includes('403')) {
                throw new Error('Acesso negado (403). Seu IP pode não estar na whitelist do firewall do TJBA.');
            }
            throw new Error(`Erro ao consultar processo: ${error.message}`);
        }
    }
    // ============================================
    // Consulta de Processo Profunda (com documentos)
    // ============================================
    async consultarProcessoProfunda(numeroProcesso) {
        this.validateCredentials();
        const client = await this.getIntercomunicacaoClient();
        const params = {
            idConsultante: this.config.username,
            senhaConsultante: this.config.password,
            numeroProcesso: numeroProcesso,
            movimentos: true,
            incluirCabecalho: true,
            incluirDocumentos: true,
        };
        this.log(`Consultando processo profunda (com documentos): ${numeroProcesso}`);
        try {
            const [result] = await client.consultarProcessoAsync(params);
            if (result.sucesso === false || result.mensagem?.includes('erro')) {
                throw new Error(result.mensagem || 'Erro ao consultar processo');
            }
            return this.parseProcessoResponse(result, numeroProcesso, true);
        }
        catch (error) {
            if (error.message.includes('403')) {
                throw new Error('Acesso negado (403). Seu IP pode não estar na whitelist do firewall do TJBA.');
            }
            throw new Error(`Erro ao consultar processo profunda: ${error.message}`);
        }
    }
    // ============================================
    // Consulta por CPF ou CNPJ
    // ============================================
    async consultarProcessoPorDocumento(documento, opcoes) {
        this.validateCredentials();
        const client = await this.getIntercomunicacaoClient();
        const documentoLimpo = documento.replace(/[^\d]/g, '');
        const params = {
            idConsultante: this.config.username,
            senhaConsultante: this.config.password,
            documento: documentoLimpo,
            pagina: opcoes?.pagina ?? 1,
            tamanhoPagina: opcoes?.tamanhoPagina ?? 20,
        };
        this.log(`Consultando processos por documento: ${documentoLimpo}`);
        try {
            if (typeof client.consultarPorDocumentoAsync === 'function') {
                const [result] = await client.consultarPorDocumentoAsync(params);
                return this.parseListaProcessosResponse(result);
            }
            if (typeof client.consultarProcessoParteAsync === 'function') {
                const [result] = await client.consultarProcessoParteAsync({
                    idConsultante: this.config.username,
                    senhaConsultante: this.config.password,
                    numeroDocumento: documentoLimpo,
                });
                return this.parseListaProcessosResponse(result);
            }
            throw new Error('Método de consulta por documento não disponível neste tribunal. Verifique a documentação do MNI.');
        }
        catch (error) {
            if (error.message.includes('403')) {
                throw new Error('Acesso negado (403). Seu IP pode não estar na whitelist do firewall do TJBA.');
            }
            throw new Error(`Erro ao consultar por documento: ${error.message}`);
        }
    }
    // ============================================
    // Consulta por Nome da Parte
    // ============================================
    async consultarProcessoPorNome(nome, opcoes) {
        this.validateCredentials();
        const client = await this.getIntercomunicacaoClient();
        const params = {
            idConsultante: this.config.username,
            senhaConsultante: this.config.password,
            nomeParte: nome,
            tipoParte: opcoes?.tipoParte ?? 'TODOS',
            pagina: opcoes?.pagina ?? 1,
            tamanhoPagina: opcoes?.tamanhoPagina ?? 20,
        };
        this.log(`Consultando processos por nome: ${nome}`);
        try {
            if (typeof client.consultarPorNomeAsync === 'function') {
                const [result] = await client.consultarPorNomeAsync(params);
                return this.parseListaProcessosResponse(result);
            }
            if (typeof client.consultarProcessoParteAsync === 'function') {
                const [result] = await client.consultarProcessoParteAsync({
                    idConsultante: this.config.username,
                    senhaConsultante: this.config.password,
                    nomeParte: nome,
                });
                return this.parseListaProcessosResponse(result);
            }
            throw new Error('Método de consulta por nome não disponível neste tribunal. Verifique a documentação do MNI.');
        }
        catch (error) {
            if (error.message.includes('403')) {
                throw new Error('Acesso negado (403). Seu IP pode não estar na whitelist do firewall do TJBA.');
            }
            throw new Error(`Erro ao consultar por nome: ${error.message}`);
        }
    }
    // ============================================
    // Consulta de Conteúdo de Documento
    // ============================================
    async consultarConteudoDocumento(numeroProcesso, idDocumento) {
        this.validateCredentials();
        const client = await this.getIntercomunicacaoClient();
        this.log(`Consultando conteúdo do documento ${idDocumento} do processo ${numeroProcesso}`);
        try {
            if (typeof client.consultarDocumentoAsync === 'function') {
                const params = {
                    idConsultante: this.config.username,
                    senhaConsultante: this.config.password,
                    numeroProcesso: numeroProcesso,
                    idDocumento: idDocumento,
                };
                const [result] = await client.consultarDocumentoAsync(params);
                return this.parseDocumentoResponse(result);
            }
            const processo = await this.consultarProcessoProfunda(numeroProcesso);
            if (processo.documentos && processo.documentos.length > 0) {
                const documento = processo.documentos.find(d => d.id === idDocumento);
                if (documento) {
                    return documento;
                }
                throw new Error(`Documento ${idDocumento} não encontrado no processo`);
            }
            throw new Error('Nenhum documento encontrado no processo');
        }
        catch (error) {
            if (error.message.includes('403')) {
                throw new Error('Acesso negado (403). Seu IP pode não estar na whitelist do firewall do TJBA.');
            }
            throw new Error(`Erro ao consultar documento: ${error.message}`);
        }
    }
    // ============================================
    // Consulta de Avisos Pendentes
    // ============================================
    async consultarAvisosPendentes() {
        this.validateCredentials();
        const client = await this.getIntercomunicacaoClient();
        const params = {
            idConsultante: this.config.username,
            senhaConsultante: this.config.password,
        };
        this.log('Consultando avisos pendentes...');
        try {
            if (typeof client.consultarAvisosPendentesAsync !== 'function') {
                throw new Error('Método consultarAvisosPendentes não disponível');
            }
            const [result] = await client.consultarAvisosPendentesAsync(params);
            return result.aviso || [];
        }
        catch (error) {
            throw new Error(`Erro ao consultar avisos: ${error.message}`);
        }
    }
    // ============================================
    // Consulta Teor da Comunicação
    // ============================================
    async consultarTeorComunicacao(identificadorAviso) {
        this.validateCredentials();
        const client = await this.getIntercomunicacaoClient();
        const params = {
            idConsultante: this.config.username,
            senhaConsultante: this.config.password,
            identificadorAviso: identificadorAviso,
        };
        this.log(`Consultando teor da comunicação: ${identificadorAviso}`);
        try {
            const [result] = await client.consultarTeorComunicacaoAsync(params);
            return result;
        }
        catch (error) {
            throw new Error(`Erro ao consultar teor: ${error.message}`);
        }
    }
    // ============================================
    // Consulta de Precedentes no BNP (CNJ)
    // ============================================
    async consultarPrecedentesBNP(termo, opcoes) {
        this.log(`Consultando precedentes no BNP: ${termo}`);
        try {
            const params = {
                q: termo,
                page: opcoes?.pagina ?? 0,
                size: opcoes?.tamanhoPagina ?? 10,
            };
            if (opcoes?.tribunal) {
                params.tribunal = opcoes.tribunal;
            }
            if (opcoes?.especie) {
                params.especie = opcoes.especie;
            }
            if (opcoes?.dataInicio) {
                params.dataInicio = opcoes.dataInicio;
            }
            if (opcoes?.dataFim) {
                params.dataFim = opcoes.dataFim;
            }
            const response = await axios.get(`${this.config.bnpApiUrl}/api/precedentes/busca`, {
                params,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'PJE-MCP-Server/3.0',
                },
                timeout: 30000,
            });
            if (response.data && response.data.content) {
                return this.parsePrecedentesResponse(response.data.content);
            }
            return [];
        }
        catch (error) {
            try {
                const response = await axios.get(`${this.config.bnpApiUrl}/api/v1/precedentes`, {
                    params: {
                        termo: termo,
                        pagina: opcoes?.pagina ?? 0,
                        tamanho: opcoes?.tamanhoPagina ?? 10,
                    },
                    headers: {
                        'Accept': 'application/json',
                    },
                    timeout: 30000,
                });
                if (response.data) {
                    return this.parsePrecedentesResponse(response.data);
                }
                return [];
            }
            catch (innerError) {
                this.log(`Erro na API do BNP: ${innerError.message}`);
                throw new Error(`Erro ao consultar BNP: ${error.message}. Verifique se a API está disponível em ${this.config.bnpApiUrl}`);
            }
        }
    }
    // ============================================
    // Métodos de Parse
    // ============================================
    parseProcessoResponse(result, numeroProcesso, incluirDocumentos = false) {
        const processo = result.processo || result;
        const dadosBasicos = processo.dadosBasicos || processo;
        const parsed = {
            numero: numeroProcesso,
            classe: dadosBasicos.classeProcessual?.descricao || dadosBasicos.attributes?.classeProcessual,
            assuntos: this.parseAssuntos(dadosBasicos.assunto || processo.assuntos),
            orgaoJulgador: dadosBasicos.orgaoJulgador?.attributes?.nomeOrgao || processo.orgaoJulgador,
            partes: this.parsePartes(dadosBasicos.polo || processo.partes),
            movimentacoes: this.parseMovimentacoes(processo.movimento || processo.movimentacoes),
            dataAjuizamento: dadosBasicos.attributes?.dataAjuizamento || processo.dataAjuizamento,
            situacao: dadosBasicos.outroParametro?.find((p) => p.attributes?.nome === 'mni:situacaoProcesso')?.attributes?.valor || processo.situacao,
            valorCausa: dadosBasicos.valorCausa || processo.valorCausa,
            prioridade: dadosBasicos.prioridade || processo.prioridade,
            dadosBasicos: dadosBasicos,
        };
        if (incluirDocumentos) {
            parsed.documentos = this.parseDocumentos(processo.documento || processo.documentos);
        }
        return parsed;
    }
    parseListaProcessosResponse(result) {
        const processos = result.processo || result.processos || result.content || [];
        if (!Array.isArray(processos)) {
            return processos ? [this.parseProcessoResponse(processos, processos.numero || processos.attributes?.numero)] : [];
        }
        return processos.map((p) => this.parseProcessoResponse(p, p.numero || p.attributes?.numero));
    }
    parseAssuntos(assuntos) {
        if (!assuntos)
            return [];
        if (!Array.isArray(assuntos))
            assuntos = [assuntos];
        return assuntos.map((a) => {
            if (typeof a === 'string')
                return a;
            return a.descricao || a.assuntoLocal?.descricao || `Código: ${a.codigoNacional || a.codigo || JSON.stringify(a)}`;
        });
    }
    parsePartes(polos) {
        if (!polos)
            return [];
        if (!Array.isArray(polos))
            polos = [polos];
        const partes = [];
        for (const polo of polos) {
            const tipoPolo = polo.attributes?.polo || polo.polo || polo.tipoPolo || 'DESCONHECIDO';
            const partesDoPolos = polo.parte || polo.partes || [];
            const partesArray = Array.isArray(partesDoPolos) ? partesDoPolos : [partesDoPolos];
            for (const parte of partesArray) {
                if (!parte)
                    continue;
                const pessoa = parte.pessoa || {};
                const attrs = pessoa.attributes || pessoa;
                partes.push({
                    tipo: tipoPolo === 'AT' ? 'ATIVO' : tipoPolo === 'PA' ? 'PASSIVO' : tipoPolo,
                    nome: attrs.nome || parte.nome || 'N/A',
                    documento: attrs.numeroDocumentoPrincipal || parte.documento,
                    advogados: this.parseAdvogados(parte.advogado || parte.advogados),
                });
            }
        }
        return partes;
    }
    parseAdvogados(advogados) {
        if (!advogados)
            return [];
        if (!Array.isArray(advogados))
            advogados = [advogados];
        return advogados.map((a) => {
            if (typeof a === 'string')
                return a;
            const attrs = a.attributes || a;
            return attrs.nome || a.identificacao || JSON.stringify(a);
        });
    }
    parseMovimentacoes(movimentos) {
        if (!movimentos)
            return [];
        if (!Array.isArray(movimentos))
            movimentos = [movimentos];
        return movimentos.map((m) => ({
            data: m.dataHora || m.data,
            descricao: m.movimentoLocal?.descricao || m.descricao || m.complemento || 'N/A',
            tipo: m.movimentoNacional?.descricao || m.tipo,
            codigo: m.movimentoNacional?.codigoNacional || m.codigo,
        }));
    }
    parseDocumentos(documentos) {
        if (!documentos)
            return [];
        if (!Array.isArray(documentos))
            documentos = [documentos];
        return documentos.map((d) => {
            const attrs = d.attributes || d;
            return {
                id: attrs.idDocumento || d.id,
                nome: attrs.descricao || d.nome,
                tipo: attrs.tipoDocumento || d.tipo,
                dataInclusao: attrs.dataInclusao || d.dataInclusao,
                mimetype: attrs.mimetype || d.mimetype,
                conteudo: d.conteudo,
                hash: attrs.hash || d.hash,
            };
        });
    }
    parseDocumentoResponse(result) {
        const doc = result.documento || result;
        const attrs = doc.attributes || doc;
        return {
            id: attrs.idDocumento || doc.id,
            nome: attrs.descricao || doc.nome,
            tipo: attrs.tipoDocumento || doc.tipo,
            dataInclusao: attrs.dataInclusao || doc.dataInclusao,
            mimetype: attrs.mimetype || doc.mimetype,
            conteudo: doc.conteudo,
            hash: attrs.hash || doc.hash,
        };
    }
    parsePrecedentesResponse(precedentes) {
        if (!precedentes)
            return [];
        if (!Array.isArray(precedentes))
            precedentes = [precedentes];
        return precedentes.map((p) => ({
            id: p.id || p.idPrecedente,
            tribunal: p.tribunal || p.sigla,
            especie: p.especie || p.tipoDecisao,
            numero: p.numero || p.numeroProcesso,
            ementa: p.ementa || p.textoEmenta,
            teseJuridica: p.teseJuridica || p.tese,
            dataJulgamento: p.dataJulgamento || p.data,
            relator: p.relator || p.nomeRelator,
            orgaoJulgador: p.orgaoJulgador || p.nomeOrgao,
        }));
    }
    log(message) {
        if (this.config.debug) {
            console.error(`[PJE-MNI] ${message}`);
        }
    }
}
// ============================================
// Servidor MCP
// ============================================
const pjeClient = new PJEMNIClient();
const server = new Server({
    name: "pje-mcp-server",
    version: "3.0.0",
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
                            description: "Incluir documentos do processo (padrão: false)",
                        },
                    },
                    required: ["numero"],
                },
            },
            {
                name: "pje_consultar_processo_profunda",
                description: "Consulta profunda de um processo, incluindo todos os documentos e metadados completos",
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
    console.error("🔐 PJE MCP Server (MNI/SOAP + BNP) v3.0.0 iniciado com sucesso!");
    console.error(`📌 PJE Endpoint: ${process.env.PJE_BASE_URL || "https://pje.tjba.jus.br"}`);
    console.error(`📌 BNP Endpoint: ${process.env.BNP_API_URL || "https://bnp-sempj.cloud.pje.jus.br"}`);
}
main().catch((error) => {
    console.error("Erro fatal:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map