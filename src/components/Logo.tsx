/** The WALRUS mark (coral on transparent, from the logo PNG). */
export function Logo({ size = 28 }: { size?: number }) {
  return <img src="/walrus.png" alt="WALRUS" width={size} style={{ height: 'auto' }} />
}
