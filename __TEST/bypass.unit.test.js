/**
 * @fileoverview Testes unitários para validação dos resultados do scanner L5X.
 * Verifica a estrutura, contagem e valores dos bypasses detectados pela execução
 * do worker bypass.js contra o arquivo ProjectTest.L5X.
 * @see https://nodejs.org/docs/latest-v22.x/api/test.html
 * @see https://jsdoc.app/about-getting-started
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

/**
 * Caminho do arquivo L5X de teste.
 * @type {string}
 */
const TEST_FILE_PATH = path.resolve('__TEST', 'ProjectTest.L5X');

/**
 * Objeto de configuração utilizado pelo scanner.
 * @type {Object}
 */
const SCAN_CONFIG = {
  afi: true,
  nop: true,
  branch: true,
  keywords: ['BYPASS', 'MANUT', 'MAINT', 'MANUTENCAO', 'MAINTENANCE'],
};

/**
 * Lista de tipos de bypass esperados.
 * @type {string[]}
 */
const EXPECTED_BYPASS_TYPES = ['AFI', 'NOP', 'BRANCH', 'BYPASS', 'MANUT'];

/**
 * Lista de níveis (LEVEL) esperados.
 * @type {string[]}
 */
const EXPECTED_LEVELS = ['Standard', 'Safety'];

/**
 * Lista de nomes de programas esperados.
 * @type {string[]}
 */
const EXPECTED_PROGRAMS = ['MainProgram', 'Program01', 'SafetyProgram', 'SafetyProgram01'];

/**
 * Lista de nomes de rotinas esperadas.
 * @type {string[]}
 */
const EXPECTED_ROUTINES = ['Routine01'];

/**
 * Nome esperado do controller.
 * @type {string}
 */
const EXPECTED_CONTROLLER = 'ProjectTest';

/**
 * Data esperada de backup.
 * @type {string}
 */
const EXPECTED_BACKUP = '2026-05-10';

/**
 * Campos obrigatórios presentes em cada resultado.
 * @type {string[]}
 */
const REQUIRED_FIELDS = [
  'CONTROLLER',
  'PROGRAM',
  'ROUTINE',
  'RUNG',
  'COMMENT',
  'LEVEL',
  'BY-PASS',
  'BACKUP',
  'AUDIT. DATA',
];

/**
 * Resultados esperados por posição no array.
 * @type {Object[]}
 */
const EXPECTED_RESULTS = [
  {
    CONTROLLER: 'ProjectTest',
    PROGRAM: 'MainProgram',
    ROUTINE: 'Routine01',
    RUNG: '0',
    COMMENT: '\nAFI\n',
    LEVEL: 'Standard',
    'BY-PASS': 'AFI',
    BACKUP: '2026-05-10',
  },
  {
    CONTROLLER: 'ProjectTest',
    PROGRAM: 'MainProgram',
    ROUTINE: 'Routine01',
    RUNG: '1',
    COMMENT: '\nNOP\n',
    LEVEL: 'Standard',
    'BY-PASS': 'NOP',
    BACKUP: '2026-05-10',
  },
  {
    CONTROLLER: 'ProjectTest',
    PROGRAM: 'MainProgram',
    ROUTINE: 'Routine01',
    RUNG: '2',
    COMMENT: '\nSHORTED BRANCH\n',
    LEVEL: 'Standard',
    'BY-PASS': 'BRANCH',
    BACKUP: '2026-05-10',
  },
  {
    CONTROLLER: 'ProjectTest',
    PROGRAM: 'Program01',
    ROUTINE: 'Routine01',
    RUNG: '0',
    COMMENT: '\nBYPASS BIT\n',
    LEVEL: 'Standard',
    'BY-PASS': 'BYPASS',
    BACKUP: '2026-05-10',
  },
  {
    CONTROLLER: 'ProjectTest',
    PROGRAM: 'Program01',
    ROUTINE: 'Routine01',
    RUNG: '1',
    COMMENT: '\nMANUT BIT\n',
    LEVEL: 'Standard',
    'BY-PASS': 'MANUT',
    BACKUP: '2026-05-10',
  },
  {
    CONTROLLER: 'ProjectTest',
    PROGRAM: 'SafetyProgram',
    ROUTINE: 'Routine01',
    RUNG: '0',
    COMMENT: '\nAFI\n',
    LEVEL: 'Safety',
    'BY-PASS': 'AFI',
    BACKUP: '2026-05-10',
  },
  {
    CONTROLLER: 'ProjectTest',
    PROGRAM: 'SafetyProgram',
    ROUTINE: 'Routine01',
    RUNG: '1',
    COMMENT: '\nNOP\n',
    LEVEL: 'Safety',
    'BY-PASS': 'NOP',
    BACKUP: '2026-05-10',
  },
  {
    CONTROLLER: 'ProjectTest',
    PROGRAM: 'SafetyProgram',
    ROUTINE: 'Routine01',
    RUNG: '2',
    COMMENT: '\nSHORTED BRANCH\n',
    LEVEL: 'Safety',
    'BY-PASS': 'BRANCH',
    BACKUP: '2026-05-10',
  },
  {
    CONTROLLER: 'ProjectTest',
    PROGRAM: 'SafetyProgram01',
    ROUTINE: 'Routine01',
    RUNG: '0',
    COMMENT: '\nBYPASS BIT\n',
    LEVEL: 'Safety',
    'BY-PASS': 'BYPASS',
    BACKUP: '2026-05-10',
  },
  {
    CONTROLLER: 'ProjectTest',
    PROGRAM: 'SafetyProgram01',
    ROUTINE: 'Routine01',
    RUNG: '1',
    COMMENT: '\nMANUT BIT\n',
    LEVEL: 'Safety',
    'BY-PASS': 'MANUT',
    BACKUP: '2026-05-10',
  },
];

/**
 * Executa o scanner L5X via worker e retorna o payload SUCCESS.
 * @param {string} filepath - Caminho do arquivo L5X.
 * @param {Object} config - Configuração do scanner.
 * @returns {Promise<Object>} - Payload do worker com resultados.
 */
function startScan(filepath, config) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve('src/main', 'bypass.js'), {
      workerData: { filepath, CONFIG: config },
    });

    worker.on('message', (message) => {
      if (message.type === 'SUCCESS') {
        worker.terminate();
        resolve(message.payload);
      }
    });

    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker parou com código ${code}`));
    });
  });
}

describe('bypass.js — Resultado do Scanner L5X', () => {
  /** @type {Object} */
  let scanOutput;

  before(async () => {
    /**
     * Executa o scanner L5X e captura o resultado.
     * A função startScan retorna uma Promise que resolve com o payload
     * enviado pelo worker via mensagem SUCCESS.
     */
    scanOutput = await startScan(TEST_FILE_PATH, SCAN_CONFIG);
  });

  describe('Estrutura do output', () => {
    /**
     * Verifica que o output é um objeto.
     */
    it('deve retornar um objeto', () => {
      assert.strictEqual(typeof scanOutput, 'object');
    });

    /**
     * Verifica que o output contém a chave `results`.
     */
    it('deve conter a chave "results"', () => {
      assert.ok('results' in scanOutput);
    });

    /**
     * Verifica que o output contém a chave `totalRoutinesScanned`.
     */
    it('deve conter a chave "totalRoutinesScanned"', () => {
      assert.ok('totalRoutinesScanned' in scanOutput);
    });

    /**
     * Verifica que o output contém a chave `totalPrograms`.
     */
    it('deve conter a chave "totalPrograms"', () => {
      assert.ok('totalPrograms' in scanOutput);
    });
  });

  describe('Contagem de rotinas e programas', () => {
    /**
     * Verifica o total de rotinas escaneadas.
     */
    it('deve ter totalRoutinesScanned igual a 8', () => {
      assert.strictEqual(scanOutput.totalRoutinesScanned, 8);
    });

    /**
     * Verifica o total de programas encontrados.
     */
    it('deve ter totalPrograms igual a 4', () => {
      assert.strictEqual(scanOutput.totalPrograms, 4);
    });
  });

  describe('Array de resultados', () => {
    /**
     * Verifica que results é um array.
     */
    it('deve conter um array em "results"', () => {
      assert.ok(Array.isArray(scanOutput.results));
    });

    /**
     * Verifica a quantidade de resultados.
     */
    it('deve conter 10 resultados', () => {
      assert.strictEqual(scanOutput.results.length, 10);
    });
  });

  describe('Campos obrigatórios por resultado', () => {
    /**
     * Verifica que cada resultado contém todos os campos obrigatórios.
     */
    it('deve conter todos os campos obrigatórios em cada resultado', () => {
      for (const result of scanOutput.results) {
        for (const field of REQUIRED_FIELDS) {
          assert.ok(field in result, `Campo "${field}" ausente no resultado`);
          assert.notStrictEqual(result[field], undefined);
          assert.notStrictEqual(result[field], null);
        }
      }
    });

    /**
     * Verifica que cada campo obrigatório possui valor não vazio.
     */
    it('deve conter valores não vazios em todos os campos', () => {
      for (const result of scanOutput.results) {
        for (const field of REQUIRED_FIELDS) {
          assert.ok(
            (typeof result[field] === 'string' && result[field].trim().length > 0) ||
            typeof result[field] === 'number',
            `Campo "${field}" vazio ou inválido no resultado`,
          );
        }
      }
    });
  });

  describe('Valores de CONTROLLER', () => {
    /**
     * Verifica que todos os resultados têm o mesmo controller.
     */
    it('deve ter CONTROLLER igual a "ProjectTest" em todos os resultados', () => {
      for (const result of scanOutput.results) {
        assert.strictEqual(result.CONTROLLER, EXPECTED_CONTROLLER);
      }
    });
  });

  describe('Valores de PROGRAM', () => {
    /**
     * Verifica que todos os programas encontrados estão na lista esperada.
     */
    it('deve conter apenas programas válidos', () => {
      const foundPrograms = new Set(scanOutput.results.map((r) => r.PROGRAM));
      for (const program of foundPrograms) {
        assert.ok(EXPECTED_PROGRAMS.includes(program), `Programa "${program}" inesperado`);
      }
    });

    /**
     * Verifica que todos os 4 programas esperados foram encontrados.
     */
    it('deve encontrar todos os 4 programas esperados', () => {
      const foundPrograms = new Set(scanOutput.results.map((r) => r.PROGRAM));
      assert.strictEqual(foundPrograms.size, 4);
      for (const program of EXPECTED_PROGRAMS) {
        assert.ok(foundPrograms.has(program));
      }
    });
  });

  describe('Valores de ROUTINE', () => {
    /**
     * Verifica que todas as rotinas estão na lista esperada.
     */
    it('deve conter apenas rotinas válidas', () => {
      const foundRoutines = new Set(scanOutput.results.map((r) => r.ROUTINE));
      for (const routine of foundRoutines) {
        assert.ok(EXPECTED_ROUTINES.includes(routine));
      }
    });
  });

  describe('Valores de RUNG', () => {
    /**
     * Verifica que RUNG é um valor numérico ou string numérica.
     */
    it('deve ter RUNG como valor numérico ou string numérica', () => {
      for (const result of scanOutput.results) {
        const rungVal = result.RUNG;
        assert.ok(
          typeof rungVal === 'number' ||
          (typeof rungVal === 'string' && !isNaN(parseInt(rungVal, 10))),
        );
      }
    });

    /**
     * Verifica os números de rung esperados.
     */
    it('deve conter rung numbers válidos', () => {
      const foundRungs = new Set(scanOutput.results.map((r) => r.RUNG));
      for (const rung of foundRungs) {
        assert.ok(rung >= 0 && rung <= 10);
      }
    });
  });

  describe('Valores de LEVEL', () => {
    /**
     * Verifica que LEVEL está na lista de valores esperados.
     */
    it('deve ter LEVEL válido', () => {
      for (const result of scanOutput.results) {
        assert.ok(EXPECTED_LEVELS.includes(result.LEVEL));
      }
    });

    /**
     * Verifica que ambos os níveis Standard e Safety foram encontrados.
     */
    it('deve encontrar os níveis Standard e Safety', () => {
      const foundLevels = new Set(scanOutput.results.map((r) => r.LEVEL));
      for (const level of EXPECTED_LEVELS) {
        assert.ok(foundLevels.has(level));
      }
    });
  });

  describe('Valores de BY-PASS', () => {
    /**
     * Verifica que cada resultado tem pelo menos um tipo de bypass.
     */
    it('deve ter BY-PASS com pelo menos um tipo detectado', () => {
      for (const result of scanOutput.results) {
        assert.ok(result['BY-PASS'].trim().length > 0);
      }
    });

    /**
     * Verifica que todos os tipos de bypass encontrados estão na lista esperada.
     */
    it('deve conter apenas bypasses válidos', () => {
      const foundBypasses = new Set(scanOutput.results.map((r) => r['BY-PASS']));
      for (const bypass of foundBypasses) {
        assert.ok(EXPECTED_BYPASS_TYPES.includes(bypass), `Bypass "${bypass}" inesperado`);
      }
    });

    /**
     * Verifica que todos os 5 tipos de bypass esperados foram detectados.
     */
    it('deve detectar todos os 5 tipos de bypass esperados', () => {
      const foundBypasses = new Set(scanOutput.results.map((r) => r['BY-PASS']));
      assert.strictEqual(foundBypasses.size, 5);
      for (const bypass of EXPECTED_BYPASS_TYPES) {
        assert.ok(foundBypasses.has(bypass));
      }
    });
  });

  describe('Valores de COMMENT', () => {
    /**
     * Verifica que COMMENT contém texto relevante.
     */
    it('deve ter COMMENT com conteúdo não vazio', () => {
      for (const result of scanOutput.results) {
        assert.ok(result.COMMENT.length > 0);
      }
    });

    /**
     * Verifica que AFI, NOP, BRANCH e BYPASS aparecem nos comments.
     */
    it('deve conter textos descritivos nos comments', () => {
      const comments = scanOutput.results.map((r) => r.COMMENT);
      assert.ok(comments.some((c) => c.includes('AFI')));
      assert.ok(comments.some((c) => c.includes('NOP')));
      assert.ok(comments.some((c) => c.includes('SHORTED BRANCH')));
      assert.ok(comments.some((c) => c.includes('BYPASS BIT')));
      assert.ok(comments.some((c) => c.includes('MANUT BIT')));
    });
  });

  describe('Valores de BACKUP', () => {
    /**
     * Verifica que BACKUP possui data válida.
     */
    it('deve ter BACKUP com data no formato esperado', () => {
      for (const result of scanOutput.results) {
        assert.strictEqual(result.BACKUP, EXPECTED_BACKUP);
      }
    });
  });

  describe('Valores de AUDIT. DATA', () => {
    /**
     * Verifica que AUDIT. DATA contém timestamp.
     */
    it('deve ter AUDIT. DATA com timestamp', () => {
      for (const result of scanOutput.results) {
        assert.ok(result['AUDIT. DATA'].includes(','));
        assert.ok(result['AUDIT. DATA'].includes('/'));
      }
    });
  });

  describe('Correspondência item a item', () => {
    /**
     * Verifica cada resultado contra o valor esperado na mesma posição.
     */
    it('deve corresponder a cada resultado esperado', () => {
      for (let i = 0; i < EXPECTED_RESULTS.length; i++) {
        const actual = scanOutput.results[i];
        const expected = EXPECTED_RESULTS[i];
        for (const field of Object.keys(expected)) {
          if (field === 'AUDIT. DATA') continue;
          assert.strictEqual(
            actual[field],
            expected[field],
            `Posição ${i}, campo "${field}": esperado "${expected[field]}", got "${actual[field]}"`,
          );
        }
      }
    });
  });
});
