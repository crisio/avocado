import { PhotoPicker } from '@avocado/ui'

const plate =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#c9a77c"/><circle cx="200" cy="150" r="120" fill="#fff"/><circle cx="200" cy="150" r="95" fill="#f4efe6"/><circle cx="170" cy="125" r="35" fill="#f2c14e"/><path d="M200 185a40 40 0 0 1 65-30 40 40 0 0 1-65 30z" fill="#7fb04f"/><rect x="140" y="170" width="55" height="40" rx="12" fill="#c8935a"/></svg>',
  )

export const Empty = () => (
  <div style={{ width: 360 }}>
    <PhotoPicker onSelect={() => {}} />
  </div>
)

export const WithPhoto = () => (
  <div style={{ width: 360 }}>
    <PhotoPicker previewUrl={plate} onSelect={() => {}} />
  </div>
)
