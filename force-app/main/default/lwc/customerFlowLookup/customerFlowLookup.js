import { LightningElement, api, track, wire } from 'lwc';
import { FlowAttributeChangeEvent } from 'lightning/flowSupport';
import searchCustomerIds from '@salesforce/apex/CustomerLookupController.searchCustomerIds';

export default class CustomerFlowLookup extends LightningElement {
    @api selectedCustomerId = ''; 

    @track searchTerm = '';
    @track searchResults = [];
    @track showDropdown = false;
    @track noResults = false;

    delayTimeout;

    get comboboxClass() {
        return this.showDropdown 
            ? 'slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click slds-is-open' 
            : 'slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click';
    }

    get isExpanded() {
        return this.showDropdown;
    }

    @wire(searchCustomerIds, { searchTerm: '$searchTerm' })
    wiredResults({ data, error }) {
        if (data) {
            this.searchResults = data;
            this.noResults = data.length === 0 && this.searchTerm.length >= 2;
            
            // FIX: Prevent dropdown from reopening if the user just selected an item
            if (this.searchTerm === this.selectedCustomerId) {
                this.showDropdown = false;
            } else {
                this.showDropdown = this.searchTerm.length >= 2;
            }
        } else if (error) {
            console.error('Error fetching Customer IDs:', error);
            this.searchResults = [];
            this.showDropdown = false;
        }
    }

    handleInputChange(event) {
        window.clearTimeout(this.delayTimeout);
        const searchVal = event.target.value;
        
        this.delayTimeout = setTimeout(() => {
            this.searchTerm = searchVal;
            
            if (this.selectedCustomerId && this.searchTerm !== this.selectedCustomerId) {
                this.selectedCustomerId = '';
                this.notifyFlow();
            }
            
            if (!this.searchTerm) {
                this.selectedCustomerId = '';
                this.notifyFlow();
                this.showDropdown = false;
            }
        }, 300);
    }

    handleSelect(event) {
        const selectedId = event.currentTarget.dataset.id;
        this.searchTerm = selectedId;
        this.selectedCustomerId = selectedId;
        this.showDropdown = false;
        
        this.notifyFlow();
    }

    handleFocus() {
        if (this.searchTerm.length >= 2 && this.searchTerm !== this.selectedCustomerId) {
            this.showDropdown = true;
        }
    }

    handleBlur() {
        setTimeout(() => {
            this.showDropdown = false;
        }, 200);
    }

    notifyFlow() {
        const attributeChangeEvent = new FlowAttributeChangeEvent('selectedCustomerId', this.selectedCustomerId);
        this.dispatchEvent(attributeChangeEvent);
    }
}