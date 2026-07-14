@isTest
private class TransactionPaginationControllerTest {

    @testSetup
    static void setupData() {
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        Contact customer = new Contact(LastName = 'Partner User', Customer_ID__c = 'CUST-PT');
        insert customer;

        Card__c testCard = new Card__c(
            Name = 'Partner Test Card', 
            Expiration_Date__c = Date.today().addYears(2), 
            Cardholder_Name__c = 'Partner User', 
            Card_Number_Last_4__c = 6666, 
            Customer_Contact__c = customer.Id,
            Status__c = 'Active'
        );
        insert testCard;

        List<Transaction__c> testTxns = new List<Transaction__c>{
            new Transaction__c(Card__c = testCard.Id, Amount__c = 100, Status__c = 'Pending', Transaction_Date__c = System.now().addDays(-1), Partner_Account__c = acc.Id, Product_Code__c = 'PROD-PT', Transaction_ID__c = 'TXN-PT-1', Store_Location__c = 'NY'),
            new Transaction__c(Card__c = testCard.Id, Amount__c = 200, Status__c = 'Approved', Transaction_Date__c = System.now(), Partner_Account__c = acc.Id, Product_Code__c = 'PROD-PT', Transaction_ID__c = 'TXN-PT-2', Store_Location__c = 'CA')
        };
        insert testTxns;
    }

    @isTest
    static void testGetPaginatedTransactions() {
        Test.startTest();
        
        TransactionPaginationController.PagedResult resultAll = TransactionPaginationController.getPaginatedTransactions(10, 1, '{}', '[]');
        System.assertEquals(2, resultAll.totalItemCount, 'Should return all 2 transactions');
        System.assertEquals(2, resultAll.records.size(), 'Should contain 2 records');
        
        String filterJson = '{"Status__c":["Pending"]}';
        TransactionPaginationController.PagedResult resultFiltered = TransactionPaginationController.getPaginatedTransactions(10, 1, filterJson, '[]');
        System.assertEquals(1, resultFiltered.totalItemCount, 'Should return only 1 pending transaction');
        System.assertEquals('Pending', resultFiltered.records[0].Status__c, 'Status should match filter');
        
        String filterAmountJson = '{"minAmount":150, "maxAmount":250}';
        String sortJson = '[{"fieldName":"Amount__c", "direction":"desc"}]';
        TransactionPaginationController.PagedResult resultSorted = TransactionPaginationController.getPaginatedTransactions(10, 1, filterAmountJson, sortJson);
        System.assertEquals(1, resultSorted.totalItemCount, 'Should return only 1 transaction matching amount');
        System.assertEquals(200, resultSorted.records[0].Amount__c, 'Amount should match filter logic');

        Test.stopTest();
    }

    @isTest
    static void testGetFilterOptions() {
        Test.startTest();
        Map<String, List<String>> filterOptions = TransactionPaginationController.getFilterOptions();
        Test.stopTest();

        System.assertNotEquals(null, filterOptions, 'Filter options should not be null');
        System.assertEquals(2, filterOptions.get('Store_Location__c').size(), 'Should find 2 distinct stores');
        System.assertEquals(1, filterOptions.get('Product_Code__c').size(), 'Should find 1 distinct product');
    }
}