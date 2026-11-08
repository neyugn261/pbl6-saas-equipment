import assert from 'node:assert/strict'
import test from 'node:test'
import { hooks, nodes, webTab } from './helpers/web-tab.mjs'

function studio(file) {
  const h=hooks(),tab=webTab(async()=>{throw new Error('Studio must not call API')})
  const dates=tab.load('features/workspace/calendar-preview.ts')
  const data=tab.load('features/design/design-data.ts',{'../workspace/calendar-preview':dates})
  const ui=Object.fromEntries(['Card','Field','Choice','Notice','MachineCard','Receipt','ReviewAction','Form'].map(name=>[name,name]))
  const component=tab.load(`features/design/${file}`,{
    react:h.react,'react/jsx-runtime':h.jsx,'./StudioUI':ui,'./design-data':data,
    '../workspace/ui-values':tab.load('features/workspace/ui-values.ts'),
    '../workspace/EstimateReview':{__esModule:true,default:'EstimateReview'},
    './HistoryJourney':{__esModule:true,default:'HistoryJourney'},
  })
  return {h,component,render:(name,role)=>h.render(component[name],{role})}
}
const one=(tree,type,label)=>nodes(tree,n=>n.type===type&&n.props.label===label)[0]
const button=(tree,text)=>nodes(tree,n=>n.type==='button'&&n.props.children===text)[0]

test('work journey cannot skip serial, checklist or remaining-work evidence',()=>{
  const s=studio('StudioJourneys.tsx'),render=()=>s.render('WorkJourney','TECHNICIAN')
  let tree=render()
  one(tree,'Field','Đối chiếu serial tại hiện trường').props.onChange('WRONG')
  nodes(tree,n=>n.type==='input'&&n.props.type==='checkbox')[0].props.onChange({target:{checked:true}})
  tree=render();assert.equal(button(tree,'Tiếp tục công việc mẫu').props.disabled,true)
  assert.equal(nodes(tree,n=>n.type==='button'&&n.props['aria-pressed']!==undefined)[1].props.disabled,true)
  one(tree,'Field','Đối chiếu serial tại hiện trường').props.onChange('WP-0862')
  tree=render();button(tree,'Tiếp tục công việc mẫu').props.onClick();tree=render()
  assert.equal(button(tree,'Lập báo cáo nháp').props.disabled,true)
  for(let i=0;i<3;i++){tree=render();nodes(tree,n=>n.type==='input'&&n.props.type==='checkbox')[i].props.onChange({target:{checked:true}})}
  tree=render();assert.equal(button(tree,'Lập báo cáo nháp').props.disabled,false)
  button(tree,'Lập báo cáo nháp').props.onClick()
  for(const label of ['Sự cố ghi nhận','Các bước đã thực hiện','Tóm tắt khách được đọc']){tree=render();one(tree,'Field',label).props.onChange('Nội dung có căn cứ')}
  tree=render();assert.equal(button(tree,'Xem trước báo cáo').props.disabled,true)
  one(tree,'Field','Phần còn lại / ai cần hỗ trợ').props.onChange('Minh hẹn kiểm tra bộ điều khiển')
  tree=render();assert.equal(button(tree,'Xem trước báo cáo').props.disabled,false)
})

test('changing a return quantity after review cannot confirm an excessive return',()=>{
  const s=studio('StudioOperations.tsx'),render=()=>s.render('StockJourney','INVENTORY_STAFF')
  one(render(),'Choice','Thao tác').props.onChange('RETURN')
  one(render(),'Field','Người giao phụ tùng').props.onChange('Kỹ thuật viên mẫu')
  one(render(),'Field','Căn cứ, số phiếu hoặc lý do').props.onChange('Trả theo phiếu K01')
  button(render(),'Xem phiếu trước khi ghi nhận').props.onClick({currentTarget:{form:{reportValidity:()=>true}}})
  assert.equal(one(render(),'ReviewAction','Đọc lại để xác nhận phiếu mẫu').props.disabled,false)
  one(render(),'Field','Số lượng').props.onChange('2')
  assert.equal(one(render(),'ReviewAction','Đọc lại để xác nhận phiếu mẫu').props.disabled,true)
})

test('dispatch uses actual overlapping slots and requires a reason',()=>{
  const s=studio('StudioOperations.tsx'),render=()=>s.render('DispatchJourney','DISPATCHER')
  one(render(),'Field','Lý do phân công / đổi lịch và căn cứ trao đổi').props.onChange('Khách thống nhất khung giờ mẫu')
  assert.equal(one(render(),'ReviewAction','Đọc lại phương án điều phối').props.disabled,true)
  one(render(),'Field','Bắt đầu (UTC+7)').props.onChange('11:00')
  assert.equal(one(render(),'ReviewAction','Đọc lại phương án điều phối').props.disabled,false)
})

test('staff confirmation requires a named customer and evidence; pending extras do not become blanket closure',()=>{
  const s=studio('StudioJourneys.tsx'),render=()=>s.render('CloseoutJourney','SERVICE_MANAGER')
  assert.equal(one(render(),'ReviewAction','Đọc lại căn cứ xác nhận thay').props.disabled,true)
  one(render(),'Field','Người phía khách đã đồng ý').props.onChange('Người liên hệ mẫu')
  one(render(),'Field','Căn cứ / nội dung phản hồi đã nhận').props.onChange('Biên bản ghi nhận phạm vi một phần')
  one(render(),'Choice','Đối chiếu phạm vi chi phí').props.onChange('EXTRA_PENDING')
  one(render(),'ReviewAction','Đọc lại căn cứ xác nhận thay').props.onConfirm()
  assert.ok(nodes(render(),n=>n.type==='Receipt')[0].props.title.includes('còn chờ duyệt phát sinh'))
})

test('customer history omits private events and filters to the individual source record',()=>{
  const s=studio('HistoryJourney.tsx'),render=()=>s.h.render(s.component.default,{role:'CUSTOMER_USER'})
  assert.equal(JSON.stringify(render()).includes('Ghi chú chẩn đoán nội bộ'),false)
  one(render(),'Choice','Nguồn lịch sử').props.onChange('Phụ tùng')
  let tree=render();assert.equal(nodes(tree,n=>n.type==='li').length,1)
  one(tree,'Choice','Hồ sơ cụ thể').props.onChange('SD-MẪU-0081')
  one(render(),'Field','Từ ngày lịch sử').props.onChange('2026-11-10')
  tree=render();assert.equal(nodes(tree,n=>n.type==='li').length,0)
  assert.ok(JSON.stringify(tree).includes('Không có sự kiện theo bộ lọc'))
})
