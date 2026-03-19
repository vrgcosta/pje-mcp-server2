=== ConsultaPJe ===
Methods: 16

--- consultarClassesJudiciais ---
  IN: {"arg0":{"descricao":"xs:string","id":"xs:int","targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"},"targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]

--- consultarJurisdicoes ---
  IN: {"targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]

--- consultarTiposAudiencia ---
  IN: {"targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]

--- consultarProcessoReferencia ---
  IN: {"numeroProcesso":"xs:string","targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return', 'targetNSAlias', 'targetNamespace' ]

--- recuperarInformacoesFluxo ---
  IN: {"arg0":{"codigo":"xs:string","descricao":"xs:string","recursal":"xs:boolean","exigePoloPassivo":"xs:boolean","remessaInstancia":"xs:boolean","tipoPartePoloPassivo":{"idTipoParte":"...","descTipoParte":"...","targetNSAlias":"...","targetNamespace":"..."},"tipoPartePoloAtivo":"[circular]","targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"},"targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return', 'targetNSAlias', 'targetNamespace' ]

--- consultarSalasAudiencia ---
  IN: {"orgaoJulgador":{"descricao":"xs:string","id":"xs:int","cargosJudiciais[]":{"id":"...","descricao":"...","targetNSAlias":"...","targetNamespace":"..."},"targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"},"targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]

--- consultarPapeis ---
  IN: {"arg0":"xs:string","targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]

--- consultarTodosTiposDocumentoProcessual ---
  IN: {"targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]

--- consultarPrioridadeProcesso ---
  IN: {"targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]

--- consultarTiposDocumentoProcessual ---
  IN: {"arg0":"xs:string","targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]

--- consultarOrgaosJulgadores ---
  IN: {"targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]

--- consultarAssuntosJudiciais ---
  IN: {"arg0":{"descricao":"xs:string","id":"xs:int","targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"},"arg1":{"codigo":"xs:string","descricao":"xs:string","recursal":"xs:boolean","exigePoloPassivo":"xs:boolean","remessaInstancia":"xs:boolean","tipoPartePoloPassivo":{"idTipoParte":"...","descTipoParte":"...","targetNSAlias":"...","targetNamespace":"..."},"tipoPartePoloAtivo":"[circular]","targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"},"targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]

--- consultarClassesJudiciaisRemessa ---
  IN: {"arg0":{"descricao":"xs:string","id":"xs:int","targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"},"targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]

--- consultarProcessosPorProcessoReferencia ---
  IN: {"numeroProcessoReferencia":"xs:string","targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]

--- consultarOrgaosJulgadoresColegiados ---
  IN: {"targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]

--- consultarCompetencias ---
  IN: {"arg0":{"descricao":"xs:string","id":"xs:int","targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"},"arg1":{"codigo":"xs:string","descricao":"xs:string","recursal":"xs:boolean","exigePoloPassivo":"xs:boolean","remessaInstancia":"xs:boolean","tipoPartePoloPassivo":{"idTipoParte":"...","descTipoParte":"...","targetNSAlias":"...","targetNamespace":"..."},"tipoPartePoloAtivo":"[circular]","targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"},"arg2[]":{"codigo":"xs:string","descricao":"xs:string","complementar":"xs:boolean","targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"},"targetNSAlias":"tns","targetNamespace":"http://ws.pje.cnj.jus.br/"}
  OUT keys: [ 'return[]', 'targetNSAlias', 'targetNamespace' ]