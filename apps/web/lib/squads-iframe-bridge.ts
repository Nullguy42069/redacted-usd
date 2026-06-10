import { PublicKey } from '@solana/web3.js';
import type { TransactionInstruction } from '@solana/web3.js';

/**
 * Modeled directly after Safe's AppCommunicator + PostMessageCommunicator in safe-apps-sdk.
 * - Strict validation: message must come from the provided iframe's contentWindow (when iframeRef given)
 *   and from an allowed origin.
 * - Handler registration pattern (like Safe's .on(method, handler)).
 * - Consistent request/response with id + result/error.
 *
 * Used for dApps that integrate @sqds/iframe-adapter (the official Squads equivalent of Safe Apps SDK).
 * The dApp inside the iframe uses the adapter to call getVaultInfo / proposeTransaction via postMessage.
 * We turn propose into real Squads vault proposals (exactly like Safe turns sendTransactions into Safe txs).
 */

export type VaultInfo = {
  pubkey: string;
};

export type ProposeTransactionRequest = {
  instructions: Array<{
    programId: string;
    keys: Array<{
      pubkey: string;
      isSigner: boolean;
      isWritable: boolean;
    }>;
    data: number[];
  }>;
  type?: 'string' | 'array';
};

type MessageHandler = (payload: any) => void | Promise<any>;

export class SquadsIframeCommunicator {
  private iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  private allowedOrigin: string; // exact match like Safe (or '*' for dev)
  private handlers = new Map<string, MessageHandler>();
  private getCurrentVault: () => PublicKey | null;
  private onPropose: (ixs: TransactionInstruction[], vault: PublicKey) => Promise<void>;

  constructor(options: {
    iframeRef?: React.RefObject<HTMLIFrameElement | null>;
    allowedOrigin?: string;
    getCurrentVault: () => PublicKey | null;
    onProposeTransaction: (instructions: TransactionInstruction[], vault: PublicKey) => Promise<void>;
  }) {
    this.iframeRef = options.iframeRef;
    this.allowedOrigin = options.allowedOrigin || '*';
    this.getCurrentVault = options.getCurrentVault;
    this.onPropose = options.onProposeTransaction;

    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.handleIncomingMessage);
    }

    // Register the two methods the @sqds/iframe-adapter speaks (mirrors Safe's getSafeInfo + sendTransactions)
    this.on('getVaultInfo', this.handleGetVaultInfo);
    this.on('proposeTransaction', this.handleProposeTransaction);
  }

  on = (method: string, handler: MessageHandler): void => {
    this.handlers.set(method, handler);
  };

  private isValidMessage = (event: MessageEvent): boolean => {
    if (!event.data || typeof event.data !== 'object') return false;

    const fromIframe = this.iframeRef?.current
      ? this.iframeRef.current.contentWindow === event.source
      : true; // for external/opener cases we relax (bookmarklet path uses different listener)

    const originOk =
      this.allowedOrigin === '*' || event.origin === this.allowedOrigin;

    const hasIdAndMethod = typeof event.data.id !== 'undefined' && typeof event.data.method === 'string';

    return fromIframe && originOk && hasIdAndMethod;
  };

  private handleIncomingMessage = async (event: MessageEvent): Promise<void> => {
    if (!this.isValidMessage(event)) return;

    const { data } = event;
    const handler = this.handlers.get(data.method);
    if (!handler) return;

    try {
      const result = await handler(data.params);
      // Mirror Safe's response shape
      (event.source as any)?.postMessage(
        { id: data.id, result },
        (event.origin as any) || '*'
      );
    } catch (err: any) {
      console.error('[SquadsIframeCommunicator] handler error', err);
      (event.source as any)?.postMessage(
        { id: data.id, error: String(err?.message || err) },
        (event.origin as any) || '*'
      );
    }
  };

  private handleGetVaultInfo = async (): Promise<any> => {
    const vault = this.getCurrentVault();
    if (!vault) throw new Error('No vault');
    // Adapter expects array of vaults (like Safe returns array for some info calls)
    return [{ pubkey: vault.toBase58() }];
  };

  private handleProposeTransaction = async (params: ProposeTransactionRequest): Promise<any> => {
    const vault = this.getCurrentVault();
    if (!vault) throw new Error('No vault loaded');

    const ixs: TransactionInstruction[] = (params.instructions || []).map((ix) => ({
      programId: new PublicKey(ix.programId),
      keys: (ix.keys || []).map((k) => ({
        pubkey: new PublicKey(k.pubkey),
        isSigner: !!k.isSigner,
        isWritable: !!k.isWritable,
      })),
      data: Buffer.from(ix.data || []),
    }));

    await this.onPropose(ixs, vault);
    return { success: true };
  };

  clear = (): void => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.handleIncomingMessage);
    }
    this.handlers.clear();
  };
}

/**
 * Back-compat helper (used by current apps/page.tsx).
 * Creates the class communicator.
 * For the overlay iframe, pass the iframeRef for strict Safe-style source validation.
 */
export function setupSquadsIframeBridge(options: {
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  allowedOrigins?: string[];
  getCurrentVault: () => PublicKey | null;
  onProposeTransaction: (instructions: TransactionInstruction[], vault: PublicKey) => Promise<void>;
}) {
  const allowed = options.allowedOrigins?.[0] || '*';
  // We keep a single instance per setup for now (the page effect will recreate on deps change)
  return new SquadsIframeCommunicator({
    iframeRef: options.iframeRef,
    allowedOrigin: allowed,
    getCurrentVault: options.getCurrentVault,
    onProposeTransaction: options.onProposeTransaction,
  });
}
