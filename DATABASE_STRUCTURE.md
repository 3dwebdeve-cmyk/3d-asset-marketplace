DATABASE DESIGN
3D Asset Marketplace Platform
Version: 2.0
1. Introduction
The database is designed using a relational database architecture to provide a
secure, scalable, and maintainable foundation for the 3D Model Marketplace Platform. The platform manages three primary business modules:  3D Asset Marketplace  Plugin Marketplace  Custom Project Portal
The database is designed to support more than 20,000 digital assets, thousands of
international customers, secure payment processing, digital downloads, and future
expansion without major structural modifications. The selected Database Management System (DBMS) is PostgreSQL because of its
scalability, reliability, advanced indexing capabilities, JSON support, and excellent
integration with Django. 2. Database Objectives
The database is designed to:  Store customer information securely.  Manage thousands of 3D assets.  Manage plugin products.  Handle custom project requests.  Store multiple downloadable file versions.  Process international orders.  Maintain secure payment records.  Track digital downloads.  Maintain customer reviews.  Store project communications.  Support future platform expansion. 3. Main Database Modules
The database consists of the following modules:  Authentication
 Marketplace  Plugin Store  Custom Project Portal  Orders  Payments  Downloads  Customer Dashboard
 Admin Dashboard
 Analytics
4. Main Database Tables
User Management
 Users  Roles  User Profiles
Marketplace
 Categories  Products  Product Images  Product Files  Product Tags
Plugin Marketplace
 Plugins  Plugin Categories  Plugin Files  Plugin Images
Custom Project Portal
 Custom Projects  Project Files  Project Messages  Project Quotations  Project Deliveries
Commerce
 Shopping Cart  Cart Items  Orders  Order Items  Payments  Invoices  Coupons
Customer Features
 Wishlist  Reviews  Notifications  Download History
Administration
 Analytics  Activity Logs
5. Table Descriptions
Users
Stores registered customer and administrator accounts. Fields
 id (UUID)  full_name  email  password
 phone  country
 avatar  role_id
 email_verified
 is_active
 last_login
 created_at  updated_at
Roles
Stores user roles. Fields
 id
 role_name  description
Default Roles
 Administrator  Customer
User Profiles
Stores additional profile information. Fields
 id
 user_id
 company_name  website  address  city
 state  postal_code  country
Categories
Stores product categories. Fields
 id
 name
 slug
 description
 image  parent_category
 created_at
Examples:  Architecture  Furniture  Interior  Vehicles  Characters  Nature  Electronics
Products
Stores all 3D models available for sale. Fields
 id
 category_id
 name  slug
 description
 short_description
 price  currency
 discount_price  thumbnail  preview_model  preview_video
 polygon_count  vertex_count  software_used
 animated
 rigged
 pbr_ready
 game_ready
 license_type  average_rating
 total_downloads  status  created_at  updated_at
Product Images
Stores gallery images. Fields
 id
 product_id
 image_url  display_order
Product Files
Stores downloadable product files. Fields
 id
 product_id
 file_name  file_format  file_size  storage_path
 version
 uploaded_at
Supported formats:  .blend
 .fbx
 .obj  .glb
 .gltf  .max
 Textures  HDRI  ZIP
Product Tags
Stores searchable keywords. Fields
 id
 product_id
 tag_name
Examples:  Low Poly
 High Poly
 Game Ready
 PBR
 Animated
Plugin Categories
Stores plugin categories. Examples:  Blender  Maya  3ds Max
 AutoCAD
 SketchUp
Plugins
Stores plugin products. Fields
 id
 category_id
 name  slug
 description
 version
 compatible_software  price  currency
 thumbnail  documentation
 status  created_at  updated_at
Plugin Files
Stores downloadable plugin packages. Fields
 id
 plugin_id
 version
 file_name  file_size  storage_path
Plugin Images
Stores plugin screenshots. Fields
 id
 plugin_id
 image_url  display_order
Shopping Cart
Stores customer shopping carts. Fields
 id
 user_id
 created_at
Cart Items
Stores products added to the shopping cart. Fields
 id
 cart_id
 product_type  product_id
 quantity
 price
Product Type
 3D Model  Plugin
Orders
Stores customer purchases. Fields
 id
 user_id
 invoice_number  total_amount  currency
 payment_status  order_status  created_at
Order Items
Stores purchased items. Fields
 id
 order_id
 product_type  product_id
 quantity
 purchase_price
Payments
Stores payment transactions. Fields
 id
 order_id
 gateway
 transaction_id
 amount  currency
 payment_status  payment_date
Supported gateway:  Stripe
Invoices
Stores invoice information. Fields
 id
 order_id
 invoice_number  invoice_pdf  created_at
Coupons
Stores promotional offers. Fields
 id
 code  discount_type  discount_value  expiry_date  active
Downloads
Stores customer download event records (download_history table).
Fields
 id (UUID)
 user_id (FK)
 product_type
 product_id
 file_id (ProductFile or PluginFile UUID)
 file_name (snapshot at download time)
 order_id (FK, nullable — best matching paid order)
 downloaded_at
Deferred until Cloudflare signed URLs: signed_url, expires_at
Wishlist
Stores customer favorite products. Fields
 id
 user_id
 product_type  product_id
Reviews
Stores customer ratings. Fields
 id
 user_id
 product_type  product_id
 rating
 review_text
 is_hidden
 created_at
 updated_at
Product / Plugin aggregates
 average_rating (denormalized from visible reviews)
 review_count (denormalized count of visible reviews)
Notifications
Stores platform notifications. Fields
 id
 user_id
 title  message  read_status  created_at
Custom Projects
Stores custom modeling requests submitted by customers. Fields
 id
 customer_id
 project_title  project_description
 category
 estimated_budget  deadline  project_status  quotation_amount  assigned_designer  payment_status  created_at  updated_at
Project Files
Stores customer reference files and final project files. Fields
 id
 project_id
 uploaded_by
 file_type  file_name  storage_path
 uploaded_at
File Types
 Reference Image  CAD Drawing
 Sketch
 Final Model  Texture  ZIP
Project Messages
Stores communication between customer and administrator. Fields
 id
 project_id
 sender_id
 message  attachment  created_at
Project Quotations
Stores project quotations. Fields
 id
 project_id
 quotation_amount  estimated_delivery
 quotation_status  created_at
Quotation Status
 Pending
 Accepted
 Rejected
Project Deliveries
Stores completed project files. Fields
 id
 project_id
 delivery_version
 delivery_notes  storage_path
 delivered_at
Analytics
Stores business analytics. Examples:  Monthly Sales  Revenue  Downloads  Best Selling Models  Best Selling Plugins  Active Customers
Activity Logs
Stores important platform activities. Examples:  Login
 Payment  Product Upload
 Plugin Upload
 Download
 Project Submission
 Project Delivery
6. Entity Relationships
 One Role → Many Users  One User → One User Profile  One User → Many Orders  One User → Many Downloads  One User → Many Reviews  One User → Many Wishlist Items  One Category → Many Products  One Product → Many Images  One Product → Many Files  One Plugin Category → Many Plugins  One Plugin → Many Files  One Plugin → Many Images  One Cart → Many Cart Items  One Order → Many Order Items
 One Order → One Payment  One Order → One Invoice  One User → Many Custom Projects  One Custom Project → Many Files  One Custom Project → Many Messages  One Custom Project → One Quotation
 One Custom Project → Many Deliveries
7. Database Normalization
The database follows the Third Normal Form (3NF) to reduce redundancy and
improve consistency. Benefits include:  Elimination of duplicate data  Better storage efficiency
 Easier maintenance  Improved query performance  Higher data integrity
8. Indexing Strategy
Indexes should be created on:  Product Name  Plugin Name  Category
 Price  Slug
 Email  Transaction ID
 Invoice Number  Project Status  Created Date
9. Data Security
The database follows industry-standard security practices:  Password hashing using Django's built-in password hashing
 UUID primary keys  Foreign key constraints  Role-Based Access Control (RBAC)
 Secure payment references  No storage of payment card details  Cloud storage references instead of local file paths  Automatic timestamps for auditing
 Signed download URLs  Server-side payment verification
10. Scalability
The database is designed to support:  More than 20,000 marketplace assets  More than 10,000 plugins  Thousands of concurrent users  Unlimited customer project requests  Future AI-assisted services  Multi-language support  Multi-currency support  Stripe payment processing  Future seller marketplace functionality
11. Conclusion
The proposed database architecture provides a secure, scalable, and maintainable
foundation for the 3D Model Marketplace Platform. It supports three primary business
modules—Marketplace, Plugin Store, and Custom Project Portal—while ensuring
efficient management of users, digital assets, orders, payments, secure downloads, and project workflows. The modular design enables the platform to grow with future
business requirements without requiring major structural redesign.