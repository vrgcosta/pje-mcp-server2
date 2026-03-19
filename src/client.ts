/**
 * PJE MNI Client - Cliente SOAP para o Modelo Nacional de Interoperabilidade
 * Extraído para reuso entre o MCP Server e o Dev Server
 */

import * as soap from "soap";
import axios from "axios";
import https from "https";
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
  vinculados?: Documento[];
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

    const params = {
      idConsultante: this.config.username,
      senhaConsultante: this.config.password,
      numeroProcesso,
      movimentos: opcoes?.movimentos ?? true,
      incluirCabecalho: opcoes?.incluirCabecalho ?? true,
      incluirDocumentos: opcoes?.incluirDocumentos === true || opcoes?.incluirDocumentos === '*' ? true : false,
    };

    this.log(`Consultando processo: ${numeroProcesso} (incluirDocumentos: ${params.incluirDocumentos})`);

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
      incluirDocumentos: true,
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
  // Download de Documento via MTOM/XOP
  // ============================================

  async baixarDocumento(numeroProcesso: string, idDocumento: string): Promise<{ conteudo: Buffer; mimetype: string; nome: string }> {
    this.validateCredentials();

    this.log(`Baixando documento ${idDocumento} do processo ${numeroProcesso} via MTOM`);

    // Build SOAP XML requesting specific document
    const soapXml = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:tns="http://www.cnj.jus.br/servico-intercomunicacao-2.2.2/" xmlns:ns2="http://www.cnj.jus.br/tipos-servico-intercomunicacao-2.2.2"><soap:Body><tns:consultarProcesso><idConsultante>${this.config.username}</idConsultante><senhaConsultante>${this.config.password}</senhaConsultante><numeroProcesso>${numeroProcesso.replace(/\D/g, '')}</numeroProcesso><movimentos>false</movimentos><incluirCabecalho>false</incluirCabecalho><incluirDocumentos>true</incluirDocumentos><documento>${idDocumento}</documento></tns:consultarProcesso></soap:Body></soap:Envelope>`;

    const url = new URL(this.config.wsdlIntercomunicacao.replace('?wsdl', ''));

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': '""',
        },
      };

      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const ct = res.headers['content-type'] || '';

          if (!ct.includes('multipart')) {
            // No MTOM - check for SOAP fault
            const xml = buf.toString('utf8');
            const faultMatch = xml.match(/<faultstring>([^<]+)<\/faultstring>/);
            if (faultMatch) {
              reject(new Error(`Erro SOAP: ${faultMatch[1]}`));
              return;
            }
            reject(new Error('Resposta não contém attachment MTOM. O tribunal pode não suportar download de documentos.'));
            return;
          }

          // Parse MTOM multipart
          const bm = ct.match(/boundary="?([^"\s;]+)"?/);
          if (!bm) { reject(new Error('Boundary não encontrado no Content-Type')); return; }
          const boundary = '--' + bm[1];

          // Extract document metadata from XML part
          let docNome = 'documento';
          let docMimetype = 'application/octet-stream';
          let attachmentBuf: Buffer | null = null;

          let idx = 0;
          while (true) {
            const start = buf.indexOf(boundary, idx);
            if (start === -1) break;
            const end = buf.indexOf(boundary, start + boundary.length);
            if (end === -1) break;

            const part = buf.slice(start + boundary.length + 2, end);
            const hdrEnd = part.indexOf(Buffer.from([0x0d, 0x0a, 0x0d, 0x0a]));
            if (hdrEnd > -1) {
              const hdr = part.slice(0, hdrEnd).toString('utf8');
              const body = part.slice(hdrEnd + 4);
              const ctMatch = hdr.match(/Content-Type:\s*([^\r\n]+)/i);
              const partType = ctMatch ? ctMatch[1].trim() : '';

              if (partType.includes('xop+xml') || partType.includes('text/xml')) {
                // XML envelope - extract metadata for the SPECIFIC requested document
                const xml = body.toString('utf8');
                const docPattern = new RegExp(`idDocumento="${idDocumento}"[^>]*?(?:descricao="([^"]*)").*?(?:mimetype="([^"]*)")`, 's');
                const docMatch = xml.match(docPattern);
                if (docMatch) {
                  if (docMatch[1]) docNome = docMatch[1];
                  if (docMatch[2]) docMimetype = docMatch[2];
                } else {
                  // Fallback: try reversed attribute order
                  const docPattern2 = new RegExp(`idDocumento="${idDocumento}"[^>]*?(?:mimetype="([^"]*)").*?(?:descricao="([^"]*)")`, 's');
                  const docMatch2 = xml.match(docPattern2);
                  if (docMatch2) {
                    if (docMatch2[2]) docNome = docMatch2[2];
                    if (docMatch2[1]) docMimetype = docMatch2[1];
                  }
                }
              } else if (!partType.includes('xml')) {
                // Binary attachment - trim trailing whitespace
                let clean = body;
                while (clean.length > 0 && (clean[clean.length - 1] === 0x0d || clean[clean.length - 1] === 0x0a)) {
                  clean = clean.slice(0, clean.length - 1);
                }
                attachmentBuf = clean;
              }
            }
            idx = end;
          }

          if (attachmentBuf && attachmentBuf.length > 0) {
            this.log(`Documento baixado: ${docNome} (${docMimetype}, ${attachmentBuf.length} bytes)`);
            resolve({ conteudo: attachmentBuf, mimetype: docMimetype, nome: docNome });
          } else {
            reject(new Error('Nenhum attachment binário encontrado na resposta MTOM'));
          }
        });
      });

      req.on('error', (e) => reject(new Error(`Erro HTTP: ${e.message}`)));
      req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout ao baixar documento')); });
      req.write(soapXml);
      req.end();
    });
  }

  // Legacy method - now delegates to baixarDocumento
  async consultarConteudoDocumento(numeroProcesso: string, idDocumento: string): Promise<Documento> {
    try {
      const result = await this.baixarDocumento(numeroProcesso, idDocumento);
      return {
        id: idDocumento,
        nome: result.nome,
        mimetype: result.mimetype,
        conteudo: result.conteudo.toString('base64'),
      };
    } catch (error: any) {
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
    return movimentos.map((m: any) => {
      const attrs = m.attributes || m;
      const movNac = m.movimentoNacional || {};
      const movNacAttrs = movNac.attributes || movNac;
      const movLocal = m.movimentoLocal || {};

      // Complemento can be string or array
      let complemento = movNac.complemento || movLocal.complemento || m.complemento;
      if (Array.isArray(complemento)) complemento = complemento.join(' - ');

      const descricao = movLocal.descricao || complemento || movNac.descricao || m.descricao || 'N/A';

      return {
        data: attrs.dataHora || m.dataHora || m.data,
        descricao,
        tipo: movNacAttrs.descricao || movNac.descricao || m.tipo,
        codigo: movNacAttrs.codigoNacional || movNac.codigoNacional || m.codigo,
      };
    });
  }

  private parseDocumentos(documentos: any): Documento[] {
    if (!documentos) return [];
    if (!Array.isArray(documentos)) documentos = [documentos];
    return documentos.map((d: any) => {
      const attrs = d.attributes || d;
      const doc: Documento = {
        id: attrs.idDocumento || d.id || attrs.id,
        nome: attrs.descricao || d.nome || d.descricao,
        tipo: attrs.tipoDocumento || d.tipo,
        dataInclusao: attrs.dataHora || attrs.dataInclusao || d.dataInclusao,
        mimetype: attrs.mimetype || d.mimetype || attrs.mimeType,
        hash: attrs.hash || d.hash,
      };
      // Parse documentos vinculados (hierarquia)
      if (d.documentoVinculado) {
        const vinc = Array.isArray(d.documentoVinculado) ? d.documentoVinculado : [d.documentoVinculado];
        doc.vinculados = vinc.map((v: any) => {
          const va = v.attributes || v;
          return {
            id: va.idDocumento || v.id,
            nome: va.descricao || v.nome,
            tipo: va.tipoDocumento || v.tipo,
            dataInclusao: va.dataHora || va.dataInclusao,
            mimetype: va.mimetype || v.mimetype,
            hash: va.hash || v.hash,
          };
        });
      }
      return doc;
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
