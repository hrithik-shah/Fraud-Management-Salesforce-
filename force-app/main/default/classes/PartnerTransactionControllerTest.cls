@isTest
private class PartnerTransactionControllerTest {

    private static Card__c testCard;
    private static List<Transaction__c> testTxns;

    @testSetup
    static void setupData() {
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        Contact customer = new Contact(LastName = 'Partner User', Customer_ID__c = 'CUST-PT');
        insert customer;

        testCard = new Card__c(
            Name = 'Partner Test Card', 
            Expiration_Date__c = Date.today().addYears(2), 
            Cardholder_Name__c = 'Partner User', 
            Card_Number_Last_4__c = 6666, 
            Customer_Contact__c = customer.Id,
            Status__c = 'Active'
        );
        insert testCard;

        testTxns = new List<Transaction__c>{
            new Transaction__c(Card__c = testCard.Id, Amount__c = 100, Status__c = 'Pending', Transaction_Date__c = System.now().addDays(-1), Partner_Account__c = acc.Id, Product_Code__c = 'PROD-PT', Transaction_ID__c = 'TXN-PT-1'),
            new Transaction__c(Card__c = testCard.Id, Amount__c = 200, Status__c = 'Approved', Transaction_Date__c = System.now(), Partner_Account__c = acc.Id, Product_Code__c = 'PROD-PT', Transaction_ID__c = 'TXN-PT-2')
        };
        insert testTxns;
    }

    @isTest
    static void testGetTransactions() {
        Test.startTest();
        List<Transaction__c> results = PartnerTransactionController.getTransactions();
        Test.stopTest();

        System.assertEquals(2, results.size());
    }

    @isTest
    static void testGetPendingTransactions() {
        Test.startTest();
        List<Transaction__c> results = PartnerTransactionController.getPendingTransactions();
        Test.stopTest();

        System.assertEquals(1, results.size());
        System.assertEquals('Pending', results[0].Status__c);
    }

    @isTest
    static void testGetProcessedTransactions() {
        Test.startTest();
        List<Transaction__c> results = PartnerTransactionController.getProcessedTransactions();
        Test.stopTest();

        System.assertEquals(1, results.size());
        System.assertNotEquals('Pending', results[0].Status__c);
    }

    @isTest
    static void testUpdateTransactionStatuses() {
        List<Transaction__c> txns = [SELECT Id FROM Transaction__c WHERE Status__c = 'Pending'];
        List<Id> idsToUpdate = new List<Id>{ txns[0].Id };

        Test.startTest();
        PartnerTransactionController.updateTransactionStatuses(idsToUpdate, 'Approved');
        Test.stopTest();

        Transaction__c updatedTxn = [SELECT Status__c FROM Transaction__c WHERE Id = :txns[0].Id];
        System.assertEquals('Approved', updatedTxn.Status__c);
    }
}