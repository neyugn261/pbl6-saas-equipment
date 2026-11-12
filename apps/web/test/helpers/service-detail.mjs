export function detailUI(tab,h) {
  return tab.load('features/workspace/ServiceDetailUI.tsx', {
    react:h.react,'react/jsx-runtime':h.jsx,
    'react-router-dom':{Link:'a'},
    'lucide-react':{ArrowLeft:'icon',ArrowRight:'icon',Info:'icon',RefreshCw:'icon'},
    './WorkspaceUI':{Badge:({status}) => h.jsx.jsx('span',{children:status})},
    './service-detail-data':tab.load('features/workspace/service-detail-data.ts'),
    '../../display-names':tab.load('display-names.ts'),
    './service-detail.css':{},
  })
}
export function expand(tree) {
  if (Array.isArray(tree)) return tree.map(expand)
  if (!tree || typeof tree !== 'object') return tree
  if (typeof tree.type === 'function') return expand(tree.type(tree.props))
  return {...tree,props:{...tree.props,children:expand(tree.props?.children)}}
}
