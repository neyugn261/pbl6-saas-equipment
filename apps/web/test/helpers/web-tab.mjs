import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

export function webTab(fetch, env = {}, storage = new Map()) {
  const sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  }
  const window = new EventTarget()
  let generation = 0, token = 'access-token'
  const session = {
    getSessionGeneration: () => generation,
    getAccessToken: () => token,
    refresh: async () => { token += '-renewed'; return token },
    useSession: () => ({ profile: { id: 'staff', tenantId: 'tenant', roles: ['INVENTORY_STAFF'], userType: 'TENANT_STAFF' } }),
  }
  function load(path, imports = {}) {
    const source = readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8')
      .replaceAll('import.meta.env', '__env')
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 },
      fileName: path,
    }).outputText
    const exports = {}
    vm.runInNewContext(code, {
      exports, fetch, sessionStorage, window, Event, AbortSignal, crypto, URLSearchParams,
      __env: env,
      require: (name) => {
        if (!(name in imports)) throw new Error(`Unexpected import ${name}`)
        return imports[name]
      },
    }, { filename: path })
    return exports
  }
  const config = load('api/config.ts')
  const client = load('api/client.ts', { '../auth/session': session, './config': config })
  const stock = load('features/inventory/stock-mutation.ts', {
    '../../api/client': client, '../../auth/session': session,
  })
  return { load, client, stock, config, session, sessionStorage, window, storage,
    changeSession: () => { generation++ } }
}

// Runs the real component's handlers/effects without a DOM or a new test dependency.
export function hooks() {
  let cursor = 0, effects = []
  const slots = []
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next }]
    },
    useMemo(factory, deps) {
      const index = cursor++
      if (!slots[index] || deps.some((v, i) => v !== slots[index].deps[i])) slots[index] = { value: factory(), deps }
      return slots[index].value
    },
    useEffect(effect, deps) {
      const index = cursor++
      if (!slots[index] || deps.some((v, i) => v !== slots[index].deps[i])) {
        effects.push(() => {
          slots[index]?.cleanup?.()
          slots[index] = { deps, cleanup: effect() }
        })
      }
    },
  }
  const jsx = (type, props) => ({ type, props })
  return { react, jsx: { jsx, jsxs: jsx, Fragment: 'fragment' },
    render(component, props = {}) {
      cursor = 0; effects = []
      const tree = component(props)
      effects.forEach((effect) => effect())
      return tree
    },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()) },
  }
}

export function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, predicate))
  if (!tree || typeof tree !== 'object') return []
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)]
}
export const settle = () => new Promise((resolve) => setImmediate(resolve))
