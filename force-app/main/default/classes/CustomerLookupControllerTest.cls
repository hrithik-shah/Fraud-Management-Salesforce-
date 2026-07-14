@isTest
private class CustomerLookupControllerTest {

    @testSetup
    static void setupData() {
        List<Contact> contacts = new List<Contact>{
            new Contact(LastName = 'Test User 1', Customer_ID__c = 'CUST-10001'),
            new Contact(LastName = 'Test User 2', Customer_ID__c = 'CUST-10002'),
            new Contact(LastName = 'Test User 3', Customer_ID__c = 'CUST-20001'),
            new Contact(LastName = 'Test User 4', Customer_ID__c = 'CUST-10004')
        };
        insert contacts;
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