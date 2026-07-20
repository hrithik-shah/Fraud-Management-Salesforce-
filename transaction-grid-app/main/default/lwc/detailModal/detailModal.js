import { LightningElement, api } from 'lwc';

export default class DetailModal extends LightningElement {
    @api record;

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }
}