import { ApiItemKind, type ApiItem } from '@microsoft/api-extractor-model'

export function referenceText(item: ApiItem, plain = false): string {
  function parentPrefix(string: string): string {
    if (item.parent === undefined) {
      return string
    }

    const separator = string.startsWith('[') && string.endsWith(']') ? '' : '.'
    return `${item.parent.displayName}${separator}${string}`
  }

  switch (item.kind) {
    case ApiItemKind.CallSignature:
      return parentPrefix(`${item.displayName}`)
    case ApiItemKind.Class:
      return `${plain ? '' : 'class '}${item.displayName}`
    case ApiItemKind.Constructor:
    case ApiItemKind.ConstructSignature: {
      const parent = item.parent
      if (parent === undefined) {
        throw new Error('Constructor item is missing parent reference')
      }
      return `${plain ? '' : 'new '}${parent.displayName}`
    }
    case ApiItemKind.Enum:
      return `${plain ? '' : 'enum '}${item.displayName}`
    case ApiItemKind.EnumMember:
      return parentPrefix(item.displayName)
    case ApiItemKind.Function:
      return `${plain ? '' : 'function '}${item.displayName}`
    case ApiItemKind.IndexSignature:
      return parentPrefix(`[${item.displayName}]`)
    case ApiItemKind.Interface:
      return `${plain ? '' : 'interface '}${item.displayName}`
    case ApiItemKind.Method:
    case ApiItemKind.MethodSignature:
    case ApiItemKind.Property:
    case ApiItemKind.PropertySignature:
      return `${parentPrefix(item.displayName)}`
    case ApiItemKind.TypeAlias:
      return `${plain ? '' : 'type '}${item.displayName}`
    case ApiItemKind.Variable:
      return `${plain ? '' : 'const '}${item.displayName}`
    // case ApiItemKind.EntryPoint:
    // case ApiItemKind.Model:
    // case ApiItemKind.Namespace:
    // case ApiItemKind.None:
    // case ApiItemKind.Package:
    default:
      throw Error(item.kind)
  }
}
