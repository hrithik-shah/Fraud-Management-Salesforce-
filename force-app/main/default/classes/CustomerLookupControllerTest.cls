@isTest
private class CustomerLookupControllerTest {

    @testSetup
    static void setupData() {
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        List<Card__c> cards = new List<Card__c>{
            new Card__c(Name = 'Card 1', Expiration_Date__c = Date.today().addYears(2), Cardholder_Name__c = 'Test User', Card_Number_Last_4__c = 1001, Customer_ID__c = 'CUST-10001', Status__c = 'Active'),
            new Card__c(Name = 'Card 2', Expiration_Date__c = Date.today().addYears(2), Cardholder_Name__c = 'Test User', Card_Number_Last_4__c = 1002, Customer_ID__c = 'CUST-10002', Status__c = 'Active'),
            new Card__c(Name = 'Card 3', Expiration_Date__c = Date.today().addYears(2), Cardholder_Name__c = 'Test User', Card_Number_Last_4__c = 1003, Customer_ID__c = 'CUST-20001', Status__c = 'Active'),
            new Card__c(Name = 'Card 4', Expiration_Date__c = Date.today().addYears(2), Cardholder_Name__c = 'Test User', Card_Number_Last_4__c = 1004, Customer_ID__c = 'CUST-10004', Status__c = 'Active')
        };
        insert cards;
    }

    @isTest
    static void testSearchCustomerIdsValid() {
        Test.startTest();
        List<String> results = CustomerLookupController.searchCustomerIds('100');
        Test.stopTest();

        System.assertEquals(3, results.size());
        System.assert(results.contains('CUST-10001'));
        System.assert(results.contains('CUST-10002'));
        System.assert(results.contains('CUST-10004'));
    }

    @isTest
    static void testSearchCustomerIdsShortTerm() {
        Test.startTest();
        List<String> results = CustomerLookupController.searchCustomerIds('1');
        Test.stopTest();

        System.assertEquals(0, results.size());
    }

    @isTest
    static void testSearchCustomerIdsBlank() {
        Test.startTest();
        List<String> results = CustomerLookupController.searchCustomerIds('');
        Test.stopTest();

        System.assertEquals(0, results.size());
    }
}