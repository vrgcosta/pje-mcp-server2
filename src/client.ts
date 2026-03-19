/**
 * PJE MNI Client - Cliente SOAP para o Modelo Nacional de Interoperabilidade
 * Extraído para reuso entre o MCP Server e o Dev Server
 */

import * as soap from "soap";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

// ============================================
// Interfaces e Tipos
// ============================================

export interface PJEConfig {
  baseUrl: string;
  wsdlConsulta: string;
  wsdlIntercomunicacao: string;
  username: string;
  password: string;
  debug: boolean;
  bnpApiUrl: string;
}

export interface Processo {
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

export interface Parte {
  tipo: string;
  nome: string;
  documento?: string;
  advogados?: string[];
}

export interface Movimentacao {
  data: string;
  descricao: string;
  tipo?: string;
  codigo?: string;
}

export interface Documento {
  id?: string;
  nome?: string;
  tipo?: string;
  dataInclusao?: string;
  mimetype?: string;
  conteudo?: string;
  hash?: string;
}

export interface Precedente {
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

export class PJEMNIClient {
  private config: PJEConfig;
  private soapClientConsulta: any = null;
  private soapClientIntercomunicacao: any = null;

  constructor(overrides?: Partial<PJEConfig>) {
    this.config = this.loadConfig(overrides);
  }

  private loadConfig(overrides?: Partial<PJEConfig>): PJEConfig {
    const baseUrl = overrides?.baseUrl || process.env.PJE_BASE_URL || "https://pje.tjba.jus.br";

    return {
      baseUrl,
      wsdlConsulta: `${baseUrl}/pje/ConsultaPJe?wsdl`,
      wsdlIntercomunicacao: `${baseUrl}/pje/intercomunicacao?wsdl`,
      username: overrides?.username || process.env.PJE_USERNAME || "",
      password: overrides?.password || process.env.PJE_PASSWORD || "",
      debug: overrides?.debug ?? process.env.PJE_DEBUG === "true",
      bnpApiUrl: overrides?.bnpApiUrl || process.env.BNP_API_URL || "https://bnp-sempj.cloud.pje.jus.br",
    };
  }

  updateCredentials(username: string, password: string): void {
    this.config.username = username;
    this.config.password = password;
    // Reset clients to force re-auth
    this.soapClientConsulta = null;
    this.soapClientIntercomunicacao = null;
  }

  updateEndpoint(baseUrl: string): void {
    this.config.baseUrl = baseUrl;
    this.config.wsdlConsulta = `${baseUrl}/pje/ConsultaPJe?wsdl`;
    this.config.wsdlIntercomunicacao = `${baseUrl}/pje/intercomunicacao?wsdl`;
    this.soapClientConsulta = null;
    this.soapClientIntercomunicacao = null;
  }

  private async getConsultaClient(): Promise<any> {
    if (!this.soapClientConsulta) {
      this.log(`Conectando ao WSDL: ${this.config.wsdlConsulta}`);
      this.soapClientConsulta = await soap.createClientAsync(this.config.wsdlConsulta, {
        wsdl_options: { timeout: 30000 },
      });
    }
    return this.soapClientConsulta;
  }

  private async getIntercomunicacaoClient(): Promise<any> {
    if (!this.soapClientIntercomunicacao) {
      this.log(`Conectando ao WSDL: ${this.config.wsdlIntercomunicacao}`);
      this.soapClientIntercomunicacao = await soap.createClientAsync(this.config.wsdlIntercomunicacao, {
        wsdl_options: { timeout: 30000 },
      });
    }
    return this.soapClientIntercomunicacao;
  }

  private validateCredentials(): void {
    if (!this.config.username || !this.config.password) {
      throw new Error("Usuário e senha não configurados. Configure no painel de credenciais.");
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
  // Consulta de Processo
  // ============================================

  async consultarProcesso(numeroProcesso: string, opcoes?: {
    movimentos?: boolean;
    incluirCabecalho?: boolean;
    incluirDocumentos?: boolean | string;
  }): Promise<Processo> {
    this.validateCredentials();
    const client = await this.getIntercomunicacaoClient();

    let incluirDocsParam: string | boolean = false;
    if (opcoes?.incluirDocumentos === true) {
      incluirDocsParam = '*';
    } else if (typeof opcoes?.incluirDocumentos === 'string') {
      incluirDocsParam = opcoes.incluirDocumentos;
    }

    const params = {
      idConsultante: this.config.username,
      senhaConsultante: this.config.password,
      numeroProcesso,
      movimentos: opcoes?.movimentos ?? true,
      incluirCabecalho: opcoes?.incluirCabecalho ?? true,
      incluirDocumentos: incluirDocsParam,
    };

    this.log(`Consultando processo: ${numeroProcesso} (incluirDocumentos: ${incluirDocsParam})`);

    try {
      const [result] = await client.consultarProcessoAsync(params);
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
  // Consulta de Processo Profunda
  // ============================================

  async consultarProcessoProfunda(numeroProcesso: string): Promise<Processo> {
    this.validateCredentials();
    const client = await this.getIntercomunicacaoClient();

    const params = {
      idConsultante: this.config.username,
      senhaConsultante: this.config.password,
      numeroProcesso,
      movimentos: true,
      incluirCabecalho: true,
      incluirDocumentos: '*',
    };

    this.log(`Consultando processo profunda: ${numeroProcesso}`);

    try {
      const [result] = await client.consultarProcessoAsync(params);
      this.saveDebugFile(`processo_profunda_${numeroProcesso.replace(/\D/g, '')}_${Date.now()}.json`, result);

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
  // Consulta por CPF/CNPJ
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
      throw new Error('Método de consulta por documento não disponível neste tribunal.');
    } catch (error: any) {
      if (error.message.includes('403')) {
        throw new Error('Acesso negado (403). Seu IP pode não estar na whitelist.');
      }
      throw new Error(`Erro ao consultar por documento: ${error.message}`);
    }
  }

  // ============================================
  // Consulta por Nome
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
      throw new Error('Método de consulta por nome não disponível neste tribunal.');
    } catch (error: any) {
      if (error.message.includes('403')) {
        throw new Error('Acesso negado (403). Seu IP pode não estar na whitelist.');
      }
      throw new Error(`Erro ao consultar por nome: ${error.message}`);
    }
  }

  // ============================================
  // Consulta Conteúdo de Documento
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
          numeroProcesso,
          idDocumento,
        };
        const [result] = await client.consultarDocumentoAsync(params);
        this.saveDebugFile(`documento_${idDocumento}_${Date.now()}.json`, result);
        return this.parseDocumentoResponse(result);
      }

      const processo = await this.consultarProcessoProfunda(numeroProcesso);
      if (processo.documentos && processo.documentos.length > 0) {
        const documento = processo.documentos.find(d => d.id === idDocumento);
        if (documento) return documento;
        throw new Error(`Documento ${idDocumento} não encontrado no processo`);
      }
      throw new Error('Nenhum documento encontrado no processo');
    } catch (error: any) {
      if (error.message.includes('403')) {
        throw new Error('Acesso negado (403). Seu IP pode não estar na whitelist.');
      }
      throw new Error(`Erro ao consultar documento: ${error.message}`);
    }
  }

  // ============================================
  // Avisos Pendentes
  // ============================================

  async consultarAvisosPendentes(): Promise<any[]> {
    this.validateCredentials();
    const client = await this.getIntercomunicacaoClient();

    this.log('Consultando avisos pendentes...');

    try {
      if (typeof client.consultarAvisosPendentesAsync !== 'function') {
        throw new Error('Método consultarAvisosPendentes não disponível');
      }
      const [result] = await client.consultarAvisosPendentesAsync({
        idConsultante: this.config.username,
        senhaConsultante: this.config.password,
      });
      return result.aviso || [];
    } catch (error: any) {
      throw new Error(`Erro ao consultar avisos: ${error.message}`);
    }
  }

  // ============================================
  // Teor da Comunicação
  // ============================================

  async consultarTeorComunicacao(identificadorAviso: string): Promise<any> {
    this.validateCredentials();
    const client = await this.getIntercomunicacaoClient();

    this.log(`Consultando teor da comunicação: ${identificadorAviso}`);

    try {
      const [result] = await client.consultarTeorComunicacaoAsync({
        idConsultante: this.config.username,
        senhaConsultante: this.config.password,
        identificadorAviso,
      });
      return result;
    } catch (error: any) {
      throw new Error(`Erro ao consultar teor: ${error.message}`);
    }
  }

  // ============================================
  // Precedentes BNP
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
      if (opcoes?.tribunal) params.tribunal = opcoes.tribunal;
      if (opcoes?.especie) params.especie = opcoes.especie;
      if (opcoes?.dataInicio) params.dataInicio = opcoes.dataInicio;
      if (opcoes?.dataFim) params.dataFim = opcoes.dataFim;

      const response = await axios.get(`${this.config.bnpApiUrl}/api/precedentes/busca`, {
        params,
        headers: { 'Accept': 'application/json', 'User-Agent': 'PJE-MCP-Server/4.0' },
        timeout: 30000,
      });

      if (response.data?.content) {
        return this.parsePrecedentesResponse(response.data.content);
      }
      return [];
    } catch (error: any) {
      try {
        const response = await axios.get(`${this.config.bnpApiUrl}/api/v1/precedentes`, {
          params: { termo, pagina: opcoes?.pagina ?? 0, tamanho: opcoes?.tamanhoPagina ?? 10 },
          headers: { 'Accept': 'application/json' },
          timeout: 30000,
        });
        if (response.data) return this.parsePrecedentesResponse(response.data);
        return [];
      } catch (innerError: any) {
        throw new Error(`Erro ao consultar BNP: ${error.message}`);
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
      dadosBasicos,
    };

    if (incluirDocumentos || processo.documento || processo.documentos) {
      parsed.documentos = this.parseDocumentos(processo.documento || processo.documentos);
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
      return a.descricao || a.assuntoLocal?.descricao || `Codigo: ${a.codigoNacional || a.codigo || JSON.stringify(a)}`;
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
    if (!documentos) return [];
    if (!Array.isArray(documentos)) documentos = [documentos];
    return documentos.map((d: any) => {
      const attrs = d.attributes || d;
      const conteudoPossivel =
        d.conteudo || d.$value || d._ || d.texto ||
        d.documentoVinculado?.conteudo || d.documentoVinculado?.$value ||
        attrs.conteudo || null;
      return {
        id: attrs.idDocumento || d.id || attrs.id,
        nome: attrs.descricao || d.nome || d.descricao,
        tipo: attrs.tipoDocumento || d.tipo,
        dataInclusao: attrs.dataInclusao || d.dataInclusao,
        mimetype: attrs.mimetype || d.mimetype || attrs.mimeType,
        conteudo: conteudoPossivel,
        hash: attrs.hash || d.hash,
      };
    });
  }

  private parseDocumentoResponse(result: any): Documento {
    const doc = result.documento || result;
    const attrs = doc.attributes || doc;
    const conteudoPossivel =
      doc.conteudo || doc.$value || doc._ || doc.texto ||
      doc.documentoVinculado?.conteudo || doc.documentoVinculado?.$value ||
      attrs.conteudo || null;
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
