import { TabBar, TabBarItem } from '@avocado/ui'

export const States = () => (
  <div style={{ width: 400 }}>
    <TabBar static>
      <TabBarItem href="#" icon="home" label="Mi día" active />
      <TabBarItem href="#" icon="calendar" label="Historial" />
    </TabBar>
  </div>
)

export const ActionItem = () => (
  <div style={{ width: 400 }}>
    <TabBar static>
      <TabBarItem href="#" icon="user" label="Perfil" />
      <TabBarItem icon="logout" label="Cerrar sesión" onClick={() => {}} />
    </TabBar>
  </div>
)
