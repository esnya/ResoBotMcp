export type ArmContact = {
  meta: string;
  grabbed: boolean;
};

export class ArmContactTracker {
  private contact: ArmContact | undefined;

  updateMeta(meta: string): void {
    const current = this.contact ?? { meta: '', grabbed: false };
    this.contact = { ...current, meta };
  }

  updateGrabbed(grabbed: boolean): void {
    const current = this.contact ?? { meta: '', grabbed: false };
    this.contact = { ...current, grabbed };
  }

  get(): ArmContact | undefined {
    return this.contact;
  }
}
