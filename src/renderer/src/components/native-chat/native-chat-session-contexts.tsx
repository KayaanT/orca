import { NativeChatLinkClickContext } from '@/components/native-chat/links/actions/native-chat-link-click-context'
import {
  NativeChatAntigravityAuthProvider,
  type NativeChatAntigravityAuthTarget
} from '@/components/native-chat/antigravity-auth/native-chat-antigravity-auth'

/** What a structured chat's subtree reads: link clicks, and Antigravity's sign-in choices. */
export function NativeChatContexts(props: {
  link: React.ComponentProps<typeof NativeChatLinkClickContext>['value']
  install: { antigravityAuth: NativeChatAntigravityAuthTarget | null }
  root: React.ReactNode
}): React.JSX.Element {
  return (
    <NativeChatLinkClickContext value={props.link}>
      <NativeChatAntigravityAuthProvider target={props.install.antigravityAuth}>
        {props.root}
      </NativeChatAntigravityAuthProvider>
    </NativeChatLinkClickContext>
  )
}
