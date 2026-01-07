#!/usr/bin/env node

/**
 * PJE MCP Server - Versão MNI (SOAP) + BNP
 * Servidor MCP para integração com o PJE via Modelo Nacional de Interoperabilidade
 * e com o Banco Nacional de Precedentes (BNP) do CNJ
 * 
 * Versão: 3.0.2 - Debug intensivo para documentos
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import * as soap from "soap";
import axios from "axios";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

console.error("DEBUG ENV:", {
  username: process.env.PJE_USERNAME ? "SET" : "NOT SET",
  password: process.env.PJE_PASSWORD ? "SET" : "NOT SET",
  baseUrl: process.env.PJE_BASE_URL
});

// ============================================
// Interfaces e Tipos
// ============================================

interface PJEConfig {
  baseUrl: string;
  wsdlConsulta: string;
  wsdlIntercomunicacao: string;
  username: string;
  password: string;
  debug: boolean;
  bnpApiUrl: string;
}

interface Processo {
  numero: string;
  classe?: string;
  assuntos?: string[];
  orgaoJulgador?: string;
  partes?: Parte[];
  movimentacoes?: Movimentacao[];
  documentos?: Documento[];
  dataAjuizamento?: string;
  situacao?: string;
  valorCausa?: number;
  prioridade?: string[];
  dadosBasicos?: any;
}

interface Parte {
  tipo: string;
  nome: string;
  documento?: string;
  advogados?: string[];
}

interface Movimentacao {
  data: string;
  descricao: string;
  tipo?: string;
  codigo?: string;
}

interface Documento {
  id?: string;
  nome?: string;
  tipo?: string;
  dataInclusao?: string;
  mimetype?: string;
  conteudo?: string;
  hash?: string;
}

interface Precedente {
  id?: string;
  tribunal?: string;
  especie?: string;
  numero?: string;
  ementa?: string;
  teseJuridica?: string;
  dataJulgamento?: string;
  relator?: string;
  orgaoJulgador?: string;
}

// ============================================
// Classe Principal do Cliente PJE MNI
// ============================================

class PJEMNIClient {
  private config: PJEConfig;
  private soapClientConsulta: any = null;
  private soapClientIntercomunicacao: any = null;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): PJEConfig {
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

  private async getConsultaClient(): Promise<any> {
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

  private async getIntercomunicacaoClient(): Promise<any> {
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

  private validateCredentials(): void {
    if (!this.config.username || !this.config.password) {
      throw new Error("Usuário e senha não configurados. Verifique o arquivo .env");
    }
  }

  private saveDebugFile(filename: string, data: any): void {
    try {
      const debugDir = path.join(process.cwd(), 'debug');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      const filepath = path.join(debugDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      this.log(`Debug salvo em: ${filepath}`);
    } catch (error: any) {
      this.log(`Erro ao salvar debug: ${error.message}`);
    }
  }

  // ============================================
  // Métodos de Conexão e Status
  // ============================================

  async testarConexao(): Promise<{ sucesso: boolean; mensagem: string }> {
    this.validateCredentials();
    
    try {
      const client = await this.getIntercomunicacaoClient();
      const methods = Object.keys(client).filter(k => !k.startsWith('_') && typeof client[k] === 'function');
      
      return {
        sucesso: true,
        mensagem: `Conexão estabelecida! Métodos disponíveis: ${methods.join(', ')}`,
      };
    } catch (error: any) {
      return {
        sucesso: false,
        mensagem: `Erro na conexão: ${error.message}`,
      };
    }
  }

  getStatus(): object {
    return {
      baseUrl: this.config.baseUrl,
      wsdlConsulta: this.config.wsdlConsulta,
      wsdlIntercomunicacao: this.config.wsdlIntercomunicacao,
      bnpApiUrl: this.config.bnpApiUrl,
      credenciaisConfiguradas: !!(this.config.username && this.config.password),
      username: this.config.username ? this.config.username.substring(0, 3) + '***' : 'NÃO CONFIGURADO',
    };
  }

  async listarMetodosDisponiveis(): Promise<string[]> {
    try {
      const client = await this.getIntercomunicacaoClient();
      const methods = Object.keys(client).filter(k => 
        !k.startsWith('_') && 
        typeof client[k] === 'function' &&
        !k.endsWith('Async')
      );
      return methods;
    } catch (error: any) {
      throw new Error(`Erro ao listar métodos: ${error.message}`);
    }
  }

  // ============================================
  // Consulta de Processo (Básica)
  // ============================================

  async consultarProcesso(numeroProcesso: string, opcoes?: {
    movimentos?: boolean;
    incluirCabecalho?: boolean;
    incluirDocumentos?: boolean | string;
  }): Promise<Processo> {
    this.validateCredentials();

    const client = await this.getIntercomunicacaoClient();

    // Corrigir o parâmetro incluirDocumentos
    let incluirDocsParam: string | boolean = false;
    if (opcoes?.incluirDocumentos === true) {
      incluirDocsParam = '*';  // Para incluir todos os documentos com conteúdo
    } else if (typeof opcoes?.incluirDocumentos === 'string') {
      incluirDocsParam = opcoes.incluirDocumentos;
    }

    const params = {
      idConsultante: this.config.username,
      senhaConsultante: this.config.password,
      numeroProcesso: numeroProcesso,
      movimentos: opcoes?.movimentos ?? true,
      incluirCabecalho: opcoes?.incluirCabecalho ?? true,
      incluirDocumentos: incluirDocsParam,
    };

    this.log(`Consultando processo: ${numeroProcesso} (incluirDocumentos: ${incluirDocsParam})`);

    try {
      const [result] = await client.consultarProcessoAsync(params);
      
      // SALVAR RESPOSTA COMPLETA PARA DEBUG
      this.saveDebugFile(`processo_${numeroProcesso.replace(/\D/g, '')}_${Date.now()}.json`, result);
      
      if (result.sucesso === false || result.mensagem?.includes('erro')) {
        throw new Error(result.mensagem || 'Erro ao consultar processo');
      }

      return this.parseProcessoResponse(result, numeroProcesso);
    } catch (error: any) {
      if (error.message.includes('403')) {
        throw new Error('Acesso negado (403). Seu IP pode não estar na whitelist do firewall do TJBA.');
      }
      throw new Error(`Erro ao consultar processo: ${error.message}`);
    }
  }

  // ============================================
  // Consulta de Processo Profunda (com documentos)
  // ============================================

  async consultarProcessoProfunda(numeroProcesso: string): Promise<Processo> {
    this.validateCredentials();

    const client = await this.getIntercomunicacaoClient();

    const params = {
      idConsultante: this.config.username,
      senhaConsultante: this.config.password,
      numeroProcesso: numeroProcesso,
      movimentos: true,
      incluirCabecalho: true,
      incluirDocumentos: '*',  // Usar '*' para incluir todos os documentos com conteúdo binário
    };

    this.log(`Consultando processo profunda (com documentos): ${numeroProcesso}`);
    console.error(`[DEBUG] Parâmetros enviados:`, JSON.stringify(params, null, 2));

    try {
      const [result] = await client.consultarProcessoAsync(params);
      
      // SALVAR RESPOSTA COMPLETA PARA DEBUG
      this.saveDebugFile(`processo_profunda_${numeroProcesso.replace(/\D/g, '')}_${Date.now()}.json`, result);
      
      console.error(`[DEBUG] Tipo de resultado:`, typeof result);
      console.error(`[DEBUG] Keys do resultado:`, Object.keys(result));
      
      if (result.processo) {
        console.error(`[DEBUG] Keys do processo:`, Object.keys(result.processo));
        if (result.processo.documento) {
          console.error(`[DEBUG] Documentos encontrados:`, Array.isArray(result.processo.documento) ? result.processo.documento.length : 'objeto único');
          const primeiroDoc = Array.isArray(result.processo.documento) ? result.processo.documento[0] : result.processo.documento;
          console.error(`[DEBUG] Estrutura do primeiro documento:`, Object.keys(primeiroDoc));
          console.error(`[DEBUG] Primeiro documento completo:`, JSON.stringify(primeiroDoc, null, 2));
        } else {
          console.error(`[DEBUG] NENHUM documento encontrado no result.processo`);
        }
      }
      
      if (result.sucesso === false || result.mensagem?.includes('erro')) {
        throw new Error(result.mensagem || 'Erro ao consultar processo');
      }

      return this.parseProcessoResponse(result, numeroProcesso, true);
    } catch (error: any) {
      if (error.message.includes('403')) {
        throw new Error('Acesso negado (403). Seu IP pode não estar na whitelist do firewall do TJBA.');
      }
      throw new Error(`Erro ao consultar processo profunda: ${error.message}`);
    }
  }

  // ============================================
  // Consulta por CPF ou CNPJ
  // ============================================

  async consultarProcessoPorDocumento(documento: string, opcoes?: {
    pagina?: number;
    tamanhoPagina?: number;
  }): Promise<Processo[]> {
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
    } catch (error: any) {
      if (error.message.includes('403')) {
        throw new Error('Acesso negado (403). Seu IP pode não estar na whitelist do firewall do TJBA.');
      }
      throw new Error(`Erro ao consultar por documento: ${error.message}`);
    }
  }

  // ============================================
  // Consulta por Nome da Parte
  // ============================================

  async consultarProcessoPorNome(nome: string, opcoes?: {
    tipoParte?: 'AUTOR' | 'REU' | 'TODOS';
    pagina?: number;
    tamanhoPagina?: number;
  }): Promise<Processo[]> {
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
    } catch (error: any) {
      if (error.message.includes('403')) {
        throw new Error('Acesso negado (403). Seu IP pode não estar na whitelist do firewall do TJBA.');
      }
      throw new Error(`Erro ao consultar por nome: ${error.message}`);
    }
  }

  // ============================================
  // Consulta de Conteúdo de Documento
  // ============================================

  async consultarConteudoDocumento(numeroProcesso: string, idDocumento: string): Promise<Documento> {
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
        
        // SALVAR RESPOSTA DO DOCUMENTO PARA DEBUG
        this.saveDebugFile(`documento_${idDocumento}_${Date.now()}.json`, result);
        
        return this.parseDocumentoResponse(result);
      }

      // Fallback: usar consultarProcessoProfunda que já traz todos os documentos com conteúdo
      const processo = await this.consultarProcessoProfunda(numeroProcesso);
      
      if (processo.documentos && processo.documentos.length > 0) {
        const documento = processo.documentos.find(d => d.id === idDocumento);
        if (documento) {
          return documento;
        }
        throw new Error(`Documento ${idDocumento} não encontrado no processo`);
      }

      throw new Error('Nenhum documento encontrado no processo');
    } catch (error: any) {
      if (error.message.includes('403')) {
        throw new Error('Acesso negado (403). Seu IP pode não estar na whitelist do firewall do TJBA.');
      }
      throw new Error(`Erro ao consultar documento: ${error.message}`);
    }
  }

  // ============================================
  // Consulta de Avisos Pendentes
  // ============================================

  async consultarAvisosPendentes(): Promise<any[]> {
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
    } catch (error: any) {
      throw new Error(`Erro ao consultar avisos: ${error.message}`);
    }
  }

  // ============================================
  // Consulta Teor da Comunicação
  // ============================================

  async consultarTeorComunicacao(identificadorAviso: string): Promise<any> {
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
    } catch (error: any) {
      throw new Error(`Erro ao consultar teor: ${error.message}`);
    }
  }

  // ============================================
  // Consulta de Precedentes no BNP (CNJ)
  // ============================================

  async consultarPrecedentesBNP(termo: string, opcoes?: {
    tribunal?: string;
    especie?: string;
    dataInicio?: string;
    dataFim?: string;
    pagina?: number;
    tamanhoPagina?: number;
  }): Promise<Precedente[]> {
    this.log(`Consultando precedentes no BNP: ${termo}`);

    try {
      const params: any = {
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
    } catch (error: any) {
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
      } catch (innerError: any) {
        this.log(`Erro na API do BNP: ${innerError.message}`);
        throw new Error(`Erro ao consultar BNP: ${error.message}. Verifique se a API está disponível em ${this.config.bnpApiUrl}`);
      }
    }
  }

  // ============================================
  // Métodos de Parse
  // ============================================

  private parseProcessoResponse(result: any, numeroProcesso: string, incluirDocumentos: boolean = false): Processo {
    const processo = result.processo || result;
    const dadosBasicos = processo.dadosBasicos || processo;
    
    const parsed: Processo = {
      numero: numeroProcesso,
      classe: dadosBasicos.classeProcessual?.descricao || dadosBasicos.attributes?.classeProcessual,
      assuntos: this.parseAssuntos(dadosBasicos.assunto || processo.assuntos),
      orgaoJulgador: dadosBasicos.orgaoJulgador?.attributes?.nomeOrgao || processo.orgaoJulgador,
      partes: this.parsePartes(dadosBasicos.polo || processo.partes),
      movimentacoes: this.parseMovimentacoes(processo.movimento || processo.movimentacoes),
      dataAjuizamento: dadosBasicos.attributes?.dataAjuizamento || processo.dataAjuizamento,
      situacao: dadosBasicos.outroParametro?.find((p: any) => p.attributes?.nome === 'mni:situacaoProcesso')?.attributes?.valor || processo.situacao,
      valorCausa: dadosBasicos.valorCausa || processo.valorCausa,
      prioridade: dadosBasicos.prioridade || processo.prioridade,
      dadosBasicos: dadosBasicos,
    };

    if (incluirDocumentos || processo.documento || processo.documentos) {
      parsed.documentos = this.parseDocumentos(processo.documento || processo.documentos);
      console.error(`[DEBUG] Documentos parseados: ${parsed.documentos?.length || 0}`);
      if (parsed.documentos && parsed.documentos.length > 0) {
        console.error(`[DEBUG] Primeiro documento parseado:`, JSON.stringify(parsed.documentos[0], null, 2));
      }
    }

    return parsed;
  }

  private parseListaProcessosResponse(result: any): Processo[] {
    const processos = result.processo || result.processos || result.content || [];
    
    if (!Array.isArray(processos)) {
      return processos ? [this.parseProcessoResponse(processos, processos.numero || processos.attributes?.numero)] : [];
    }

    return processos.map((p: any) => this.parseProcessoResponse(p, p.numero || p.attributes?.numero));
  }

  private parseAssuntos(assuntos: any): string[] {
    if (!assuntos) return [];
    if (!Array.isArray(assuntos)) assuntos = [assuntos];
    
    return assuntos.map((a: any) => {
      if (typeof a === 'string') return a;
      return a.descricao || a.assuntoLocal?.descricao || `Código: ${a.codigoNacional || a.codigo || JSON.stringify(a)}`;
    });
  }

  private parsePartes(polos: any): Parte[] {
    if (!polos) return [];
    if (!Array.isArray(polos)) polos = [polos];
    
    const partes: Parte[] = [];
    
    for (const polo of polos) {
      const tipoPolo = polo.attributes?.polo || polo.polo || polo.tipoPolo || 'DESCONHECIDO';
      const partesDoPolos = polo.parte || polo.partes || [];
      const partesArray = Array.isArray(partesDoPolos) ? partesDoPolos : [partesDoPolos];
      
      for (const parte of partesArray) {
        if (!parte) continue;
        
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

  private parseAdvogados(advogados: any): string[] {
    if (!advogados) return [];
    if (!Array.isArray(advogados)) advogados = [advogados];
    
    return advogados.map((a: any) => {
      if (typeof a === 'string') return a;
      const attrs = a.attributes || a;
      return attrs.nome || a.identificacao || JSON.stringify(a);
    });
  }

  private parseMovimentacoes(movimentos: any): Movimentacao[] {
    if (!movimentos) return [];
    if (!Array.isArray(movimentos)) movimentos = [movimentos];
    
    return movimentos.map((m: any) => ({
      data: m.dataHora || m.data,
      descricao: m.movimentoLocal?.descricao || m.descricao || m.complemento || 'N/A',
      tipo: m.movimentoNacional?.descricao || m.tipo,
      codigo: m.movimentoNacional?.codigoNacional || m.codigo,
    }));
  }

  private parseDocumentos(documentos: any): Documento[] {
    if (!documentos) {
      console.error(`[DEBUG parseDocumentos] Nenhum documento recebido`);
      return [];
    }
    
    if (!Array.isArray(documentos)) documentos = [documentos];
    
    console.error(`[DEBUG parseDocumentos] Parseando ${documentos.length} documento(s)`);
    
    return documentos.map((d: any, index: number) => {
      console.error(`[DEBUG parseDocumentos] Documento ${index}:`, Object.keys(d));
      
      const attrs = d.attributes || d;
      
      // Tentar múltiplas localizações possíveis para o conteúdo
      const conteudoPossivel = 
        d.conteudo || 
        d.$value || 
        d._ || 
        d.texto ||
        d.documentoVinculado?.conteudo ||
        d.documentoVinculado?.$value ||
        attrs.conteudo ||
        null;
      
      console.error(`[DEBUG parseDocumentos] Conteúdo encontrado para doc ${index}:`, conteudoPossivel ? `SIM (${typeof conteudoPossivel}, ${conteudoPossivel.length} chars)` : 'NÃO');
      
      const doc: Documento = {
        id: attrs.idDocumento || d.id || attrs.id,
        nome: attrs.descricao || d.nome || d.descricao,
        tipo: attrs.tipoDocumento || d.tipo,
        dataInclusao: attrs.dataInclusao || d.dataInclusao,
        mimetype: attrs.mimetype || d.mimetype || attrs.mimeType,
        conteudo: conteudoPossivel,
        hash: attrs.hash || d.hash,
      };
      
      console.error(`[DEBUG parseDocumentos] Documento parseado ${index}:`, {
        id: doc.id,
        nome: doc.nome,
        temConteudo: !!doc.conteudo,
        tamanhoConteudo: doc.conteudo?.length || 0
      });
      
      return doc;
    });
  }

  private parseDocumentoResponse(result: any): Documento {
    console.error(`[DEBUG parseDocumentoResponse] Keys do result:`, Object.keys(result));
    
    const doc = result.documento || result;
    const attrs = doc.attributes || doc;
    
    console.error(`[DEBUG parseDocumentoResponse] Keys do doc:`, Object.keys(doc));
    
    // Tentar múltiplas localizações possíveis para o conteúdo
    const conteudoPossivel = 
      doc.conteudo || 
      doc.$value || 
      doc._ || 
      doc.texto ||
      doc.documentoVinculado?.conteudo ||
      doc.documentoVinculado?.$value ||
      attrs.conteudo ||
      null;
    
    console.error(`[DEBUG parseDocumentoResponse] Conteúdo:`, conteudoPossivel ? `ENCONTRADO (${typeof conteudoPossivel})` : 'NÃO ENCONTRADO');
    
    return {
      id: attrs.idDocumento || doc.id || attrs.id,
      nome: attrs.descricao || doc.nome || doc.descricao,
      tipo: attrs.tipoDocumento || doc.tipo,
      dataInclusao: attrs.dataInclusao || doc.dataInclusao,
      mimetype: attrs.mimetype || doc.mimetype || attrs.mimeType,
      conteudo: conteudoPossivel,
      hash: attrs.hash || doc.hash,
    };
  }

  private parsePrecedentesResponse(precedentes: any): Precedente[] {
    if (!precedentes) return [];
    if (!Array.isArray(precedentes)) precedentes = [precedentes];
    
    return precedentes.map((p: any) => ({
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

  private log(message: string): void {
    console.error(`[PJE-MNI] ${message}`);
  }
}

// ============================================
// Servidor MCP
// ============================================

const pjeClient = new PJEMNIClient();

const server = new Server(
  {
    name: "pje-mcp-server",
    version: "3.0.2",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

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
        const processo = await pjeClient.consultarProcesso(
          args?.numero as string,
          {
            movimentos: args?.movimentos as boolean,
            incluirCabecalho: args?.incluirCabecalho as boolean,
            incluirDocumentos: args?.incluirDocumentos as boolean,
          }
        );
        return {
          content: [{ type: "text", text: JSON.stringify(processo, null, 2) }],
        };
      }

      case "pje_consultar_processo_profunda": {
        const processo = await pjeClient.consultarProcessoProfunda(args?.numero as string);
        return {
          content: [{ type: "text", text: JSON.stringify(processo, null, 2) }],
        };
      }

      case "pje_consultar_processo_por_cpf_cnpj": {
        const processos = await pjeClient.consultarProcessoPorDocumento(
          args?.documento as string,
          {
            pagina: args?.pagina as number,
            tamanhoPagina: args?.tamanhoPagina as number,
          }
        );
        return {
          content: [{ type: "text", text: JSON.stringify(processos, null, 2) }],
        };
      }

      case "pje_consultar_processo_por_nome": {
        const processos = await pjeClient.consultarProcessoPorNome(
          args?.nome as string,
          {
            tipoParte: args?.tipoParte as 'AUTOR' | 'REU' | 'TODOS',
            pagina: args?.pagina as number,
            tamanhoPagina: args?.tamanhoPagina as number,
          }
        );
        return {
          content: [{ type: "text", text: JSON.stringify(processos, null, 2) }],
        };
      }

      case "pje_consultar_conteudo_documento": {
        const documento = await pjeClient.consultarConteudoDocumento(
          args?.numeroProcesso as string,
          args?.idDocumento as string
        );
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
        const teor = await pjeClient.consultarTeorComunicacao(args?.identificadorAviso as string);
        return {
          content: [{ type: "text", text: JSON.stringify(teor, null, 2) }],
        };
      }

      case "pje_consultar_precedentes_bnp": {
        const precedentes = await pjeClient.consultarPrecedentesBNP(
          args?.termo as string,
          {
            tribunal: args?.tribunal as string,
            especie: args?.especie as string,
            dataInicio: args?.dataInicio as string,
            dataFim: args?.dataFim as string,
            pagina: args?.pagina as number,
            tamanhoPagina: args?.tamanhoPagina as number,
          }
        );
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
  } catch (error: any) {
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