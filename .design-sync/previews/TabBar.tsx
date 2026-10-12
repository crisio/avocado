import { Button, TabBar, TabBarItem } from '@avocado/ui'

export const Patient = () => (
  <div style={{ width: 400 }}>
    <TabBar static action={<Button size="lg" fullWidth icon="camera">Registrar comida</Button>}>
      <TabBarItem href="#" icon="home" label="Mi día" active />
      <TabBarItem href="#" icon="calendar" label="Historial" />
      <TabBarItem href="#" icon="user" label="Perfil" />
    </TabBar>
  </div>
)

export const NavigationOnly = () => (
  <div style={{ width: 400 }}>
    <TabBar static>
      <TabBarItem href="#" icon="users" label="Pacientes" active />
      <TabBarItem href="#" icon="user" label="Perfil" />
      <TabBarItem icon="logout" label="Salir" onClick={() => {}} />
    </TabBar>
  </div>
)
