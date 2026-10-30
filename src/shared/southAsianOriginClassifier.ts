/**
 * High-Precision, Comprehensive South Asian Origin Classifier
 *
 * Classifies applicants based on name markers and profile cues for:
 * 1. India (all states / linguistic groups: Telugu, Tamil, Kannada, Malayalam, Hindi, Marathi, Gujarati, Punjabi, Bengali, Odia, Assamese, etc.)
 * 2. Pakistan (Punjabi, Sindhi, Pashtun, Balochi, Muhajir, Kashmiri)
 * 3. Bangladesh (Bengali Muslim & Hindu)
 * 4. Nepal (Brahmin, Chhetri, Newar, Gurung, Rai, Magar, Tamang, Tharu)
 * 5. Sri Lanka (Sinhalese, Sri Lankan Tamil, Sri Lankan Moor, Burgher)
 *
 * Evaluation rules:
 * - If definitively South Asian -> 'SOUTH_ASIAN' (isSouthAsian = true)
 * - If ambiguous, doubtful, subtle, or unconfirmed -> 'UNCERTAIN' (isSouthAsian = false -> routes to Manual Review)
 * - If non-matching / other regions -> 'OTHER' (isSouthAsian = false -> routes to Manual Review)
 */

export type SouthAsianOriginType = 'SOUTH_ASIAN' | 'UNCERTAIN' | 'OTHER';

export interface OriginResult {
  origin: SouthAsianOriginType;
  countryMatch?: 'India' | 'Pakistan' | 'Bangladesh' | 'Nepal' | 'Sri Lanka' | 'South Asia';
  confidence: number; // 0.0 to 1.0
  matchReason: string;
  isSouthAsian: boolean;
}

// ============================================================================
// 1. SURNAMES & FAMILY NAMES BY COUNTRY / REGION
// ============================================================================

// Indian Surnames across major linguistic regions
const INDIAN_SURNAMES = new Set([
  // North / Hindi Belt / Central
  'sharma', 'verma', 'gupta', 'singh', 'kumar', 'mishra', 'pandey', 'shukla', 'tiwari', 'dubey',
  'jha', 'yadav', 'chauhan', 'rajput', 'thakur', 'agarwal', 'agrawal', 'bansal', 'mittal', 'goyal',
  'singhal', 'garg', 'jain', 'kapoor', 'khanna', 'malhotra', 'bhatia', 'arora', 'chopra', 'sethi',
  'bedi', 'grover', 'anand', 'ahuja', 'juneja', 'batra', 'chawla', 'kohli', 'bhasin', 'soni',
  'mehra', 'suri', 'srivastava', 'saxena', 'mathur', 'bhatnagar', 'rastogi', 'kulshrestha', 'kashyap',
  'tripathi', 'upadhyay', 'chaubey', 'dwivedi', 'chaturvedi', 'pathak', 'ojha', 'shastri', 'tiwary',
  'kushwaha', 'keshri', 'keshari', 'bhardwaj', 'parashar', 'vats', 'sharma', 'gautam', 'khandelwal',
  'varshney', 'maheshwari', 'somani', 'kasat', 'toshniwal', 'choudhary', 'chaudhary', 'dixit',

  // Punjabi / Sikh
  'gill', 'dhillon', 'sandhu', 'grewal', 'sidhu', 'mann', 'bajwa', 'cheema', 'brar', 'deol',
  'virk', 'randhawa', 'johal', 'aulakh', 'tiwana', 'pannu', 'nagra', 'bains', 'mahal', 'toor',
  'atwal', 'nijjar', 'sahota', 'bal', 'riar', 'basra', 'bhullar', 'dhatt', 'kang', 'kahlon',
  'sohal', 'warraich', 'purewal', 'dhaliwal', 'chahal', 'sekhon', 'boparai', 'khaira',
  'behl', 'bahl', 'sood', 'puri', 'trehan', 'sehgal', 'talwar', 'tandon', 'wadhwa', 'kwatra',
  'nagpal', 'kalra', 'madan', 'lamba', 'oberoi', 'chadha', 'pasricha', 'sabharwal', 'saluja',
  'sawhney', 'walia', 'makkar', 'dhawan', 'dua', 'taneja', 'chhabra', 'manchanda', 'midha',
  'kathuria', 'luthra', 'chandok', 'jaggi', 'vohra', 'bindra', 'sondhi', 'kakkar', 'maini',
  'sibal', 'thukral', 'gulati', 'sahni',

  // Telugu (Andhra & Telangana)
  'reddy', 'reddi', 'rao', 'chowdary', 'chaudhary', 'naidu', 'varma', 'raju', 'goud', 'murthy', 'sastry',
  'prasad', 'babu', 'marri', 'pillalamarri', 'jajam', 'boga', 'kagitha', 'tammana', 'eeramalla', 'chilakala',
  'karibasappa', 'igoor', 'dhokiya', 'punde', 'pilla', 'kondapalli', 'kanneganti', 'maddipatla',
  'annadata', 'venkatesan', 'samineni', 'vuyyuru', 'ravipati', 'kodali', 'yarla', 'yarlagadda',
  'kamineni', 'boddu', 'guduru', 'alapati', 'palleti', 'nandigam', 'potluri', 'chennupati', 'patan',
  'shaik', 'kotha', 'chunduru', 'kasaraneni', 'katragadda', 'nallapati', 'yalamanchili', 'kilaru',
  'kancherla', 'jakkula', 'cheruku', 'katta', 'valluru', 'samba', 'bolloju', 'rampathoti', 'bondugula',
  'prathipati', 'maddhi', 'sheberu', 'thota', 'chintala', 'gadde', 'gadiraju', 'kandula', 'avula',
  'rayani', 'kolli', 'vaddadi', 'siripuram', 'baddam', 'katakam', 'errolla', 'pothula', 'parimi',
  'mallela', 'peddi', 'gade', 'chegondi', 'surakanti', 'kamisetti', 'chalamalasetti', 'jasti',
  'karri', 'allam', 'bathula', 'guntupalli', 'somaraju', 'somanchi', 'chilukuri', 'atluri',
  'pulavarthi', 'lingampalli', 'burugupalli', 'kondeti', 'korrapati', 'maddukuri', 'mandava',
  'motupalli', 'nadendla', 'nallamothu', 'parvataneni', 'penmatsa', 'peravali', 'polavarapu',
  'sagi', 'surapaneni', 'tummala', 'vegesna', 'yerramsetti', 'kosaraju', 'moparthi', 'kommineni',
  'paleti', 'thotakura', 'peddireddy', 'chaganti', 'nemani', 'gollamudi', 'tangirala', 'tadepalli',
  'velagapudi', 'bhavanam', 'chintha', 'devireddy', 'gopisetti', 'inna', 'jangam', 'kurapati',
  'kuppa', 'kureti', 'darapogu', 'bhukya', 'basina', 'kalari', 'sanka', 'peddapali', 'peddapally',
  'eswar', 'chittemreddy', 'gonthina', 'bhimireddy', 'pagadala', 'mallempati', 'konaparthi', 'erram',
  'alandur', 'kadium', 'jashti', 'nimmagadda', 'duddu', 'shivaram', 'mettukuru', 'thotakuri',
  'chagarlamudi', 'paidipati', 'jatavath', 'mandadapu', 'malloju', 'mutharaju', 'ganji', 'vaspari',
  'pappula', 'kadari', 'appasi', 'kandoori', 'kota', 'chinthakindi', 'bisa', 'thuniki', 'manne',
  'mutukuri', 'geddam', 'yepuri', 'lakkapally', 'alluri', 'addapa', 'guddati', 'gummadi', 'kaniganti',
  'yadavali', 'davu', 'khanapure',

  // Tamil
  'iyer', 'iyengar', 'nair', 'pillai', 'subramanian', 'subramaniam', 'ramanathan', 'balasubramanian',
  'venkataraman', 'natarajan', 'swaminathan', 'meenakshisundaram', 'ramachandran', 'krishnan',
  'narayanan', 'srinivasan', 'raghavan', 'sundaram', 'ananth', 'karthik', 'murugan', 'shanmugam',
  'shanmugarajan', 'chellappa', 'ramaswamy', 'annamalai', 'palaniappan', 'marimuthu', 'chidambaram',
  'iyyar', 'swamy', 'swami', 'nadar', 'thevar', 'chetty', 'chettiar', 'mudaliar', 'soundararajan',
  'thirunavukkarasu', 'saravanan', 'selvan', 'vadivel', 'elango', 'kanagasabai', 'rajendran',
  'muruganantham', 'dhanasekaran', 'karthikeyan', 'jayakumaran', 'arcot', 'kannan', 'alagarraj',

  // Malayalam (Kerala - authentic distinctive lineages)
  'menon', 'kurup', 'panicker', 'warrier', 'nambiar', 'namboodiri', 'varghese', 'chacko',
  'kurian', 'mammen', 'mathen', 'kallat', 'kannoth', 'thampi', 'valiyathan', 'varughese',
  'cherian', 'koshy',

  // Kannada
  'gowda', 'hegde', 'bhat', 'shetty', 'desai', 'kulkarni', 'kamath', 'pai', 'nayak', 'shenoy',
  'ballal', 'alva', 'marla', 'punja', 'kudva', 'adiga', 'somayaji', 'upasani', 'manjunath',
  'shivarudrappa', 'byregowda', 'kashappanavar', 'siddaramaiah', 'bommai', 'kumarswamy', 'hoblidar',

  // Marathi & Goan
  'deshmukh', 'shinde', 'patil', 'pawar', 'jadhav', 'more', 'gaikwad', 'chavan', 'bhosle', 'joshi',
  'kadam', 'jagtap', 'ghadge', 'salunkhe', 'mohite', 'sawant', 'khot', 'sangle', 'tambde', 'gholap',
  'raut', 'babar', 'ghule', 'thorat', 'kute', 'shelke', 'kumbhar', 'ingale', 'bhende', 'rathod',
  'godbole', 'agarkar', 'phadke', 'chiplunkar', 'kelkar', 'karve', 'tilak', 'gokhale', 'ranade',
  'abhyankar', 'bapat', 'kanetkar', 'dandekar', 'paranjpe', 'limaye', 'jog', 'apte', 'modak',
  'khare', 'tendulkar', 'gavaskar', 'pednekar', 'salgaonkar', 'karmarkar', 'kudalkar', 'borkar',
  'shirke', 'velankar', 'usgaonkar', 'keluskar', 'mandale', 'sagvekar', 'karekar',

  // Gujarati & Marwari & Sindhi
  'patel', 'shah', 'mehta', 'parikh', 'modi', 'gandhi', 'bhatt', 'trivedi', 'pandya', 'vyas',
  'jani', 'dave', 'thaker', 'somani', 'munshi', 'vakil', 'nanavati', 'vora', 'soni', 'thard',
  'gajera', 'gajipara', 'ladha', 'kankaria', 'biyani', 'dhoot', 'daga', 'bangur', 'kabra', 'singhi', 'kothari',
  'ostwal', 'lodha', 'bohra', 'jhawar', 'surana', 'manot', 'baid', 'choraria', 'nahar', 'bothra',
  'poddar', 'pugalia', 'saraf', 'todi', 'advani', 'bhambhani', 'bhavnani', 'chhabria', 'gurnani',
  'hingorani', 'israni', 'jagwani', 'kewalramani', 'lakhani', 'makhija', 'motwani', 'nihalani',
  'panjwani', 'ramchandani', 'rohra', 'tahiliani', 'vaswani', 'poonawalla', 'poonawala', 'batliwala',
  'mistry', 'wadia', 'godrej', 'tata', 'daruwala', 'ghaswala', 'oza', 'diyora', 'merai',

  // Bengali (Indian Bengali, West Bengal, Tripura)
  'das', 'roy', 'ray', 'dey', 'deb', 'saha', 'barman', 'kundu', 'nandi', 'banerjee', 'chatterjee',
  'mukherjee', 'ganguly', 'bhattacharya', 'chakraborty', 'ghosh', 'bose', 'mitra', 'dutta', 'datta',
  'sen', 'guha', 'pal', 'paul', 'adhikary', 'sengupta', 'dasgupta', 'bhaduri', 'lahiri', 'sanyal',
  'ghoshal', 'bagchi', 'samanta', 'mahanta', 'bera', 'jana', 'manna', 'haldar', 'naskar', 'baidya',
  'karan', 'pramanik', 'bhowmick', 'bhowmik', 'kushary',

  // Odia & Assamese
  'mohanty', 'patnaik', 'pattnaik', 'dash', 'sahoo', 'panda', 'rout', 'pradhan', 'behera', 'jena',
  'tripathy', 'satapathy', 'mahapatra', 'swain', 'samal', 'senapati', 'mallick', 'muduli', 'biswal',
  'kanungo', 'dalai', 'parida', 'lenka', 'barua', 'baruah', 'saikia', 'bora', 'borah', 'goswami',
  'hazarika', 'sarma', 'gogoi', 'kalita', 'chetia', 'phukan', 'deori', 'kakati', 'medhi', 'choudhury',

  // Kashmiri
  'sumbli', 'pandit', 'koul', 'kaul', 'dhar', 'dar', 'raina', 'bhat', 'tikoo', 'mattoo', 'kak',
  'sopori', 'razdan', 'kilam', 'haksar', 'nehru',
]);

// Pakistani Surnames & Lineages (Punjabi, Sindhi, Pashtun, Balochi, Muhajir, Kashmiri)
const PAKISTANI_SURNAMES = new Set([
  'butt', 'chaudhry', 'chaudhary', 'chughtai', 'dar', 'durrani', 'farooqi', 'farooq', 'gardizi',
  'gillani', 'gilani', 'hashmi', 'hayat', 'iqbal', 'janjua', 'jatoi', 'jutt', 'kasuri', 'kayani',
  'khattak', 'khawaja', 'khokhar', 'laghari', 'leghari', 'mahar', 'malik', 'marwat', 'mazari',
  'mengal', 'mian', 'mirza', 'mughal', 'nawaz', 'niazi', 'noon', 'pirzada', 'qasmi', 'qazi',
  'qureshi', 'quraishi', 'raisani', 'rind', 'rizvi', 'saigol', 'satti', 'shabbir', 'shahid',
  'sheikh', 'shaik', 'shamsi', 'siddiqui', 'siddiqi', 'siddique', 'soomro', 'syed', 'sayed',
  'talpur', 'tareen', 'tiwana', 'wasti', 'wattoo', 'wazir', 'yousafzai', 'zaidi', 'zuberi',
  'riaz', 'saleem', 'abbasi', 'bhutto', 'warraich', 'gujjar', 'arain', 'tarar', 'khosa', 'langah',
  'khan', 'hassan', 'hussain', 'ali', 'raza', 'mahmood', 'shah', 'rehman', 'akram', 'aslam',
  'rasheed', 'bhatti', 'chatha', 'cheema', 'rana', 'magsi', 'bugti', 'bizanjo', 'kalhoro',
  'daudpota', 'chandio', 'khuhro', 'alvi', 'usmani', 'ansari', 'kazmi', 'naqvi', 'bukhari',
  'afridi', 'shinwari', 'mehsud', 'bangash', 'orakzai', 'kakar', 'achakzai', 'mandokhail',
  'swati', 'tanoli', 'jadoon', 'lone', 'waza', 'rathore', 'mir', 'wani', 'tantray', 'munir',
  'latif', 'habib', 'safdar', 'gul', 'javed', 'bashir', 'sarwar', 'anwar', 'mushtaq', 'munawar',
  'iftikhar', 'parvez', 'yaseen', 'arshad', 'amjad', 'nadeem', 'khalid', 'tahir', 'waheed',
  'sajid', 'zahid', 'shahzad', 'tanveer', 'sohail', 'uralov', 'ural', 'memon', 'lalani', 'sadiq',
]);

// Bangladeshi Surnames & Lineages (Bengali Muslim & Hindu)
const BANGLADESHI_SURNAMES = new Set([
  'hossain', 'hossin', 'rahman', 'chowdhury', 'choudhury', 'ahmed', 'islam', 'sarkar', 'sarker',
  'mondal', 'mandal', 'akter', 'begum', 'khatun', 'haque', 'hoque', 'uddin', 'mia', 'miah',
  'biswas', 'majumder', 'majumdar', 'sikder', 'talukder', 'talukdar', 'bepari', 'gazi', 'kazi',
  'mollah', 'munshi', 'dewan', 'bhuiyan', 'khandakar', 'howlader', 'matubbar', 'barman', 'bhowmik',
  'chakma', 'marma', 'hasibur', 'rashik', 'anowar', 'enamul', 'tanvir', 'shahriar', 'mahbub',
  'ashraful', 'alam', 'patwary', 'shakil', 'shanto', 'mithun', 'tamim', 'mushfiqur', 'shakib',
  'mustafizur', 'taskin', 'rubel', 'mahmudullah', 'arafat', 'afif', 'tawhid', 'shohag',
  'liton', 'miraz', 'mehidy', 'saifuddin', 'soumya', 'sharmin', 'kashfia',
]);

// Nepalese Surnames & Family Lineages (Brahmin, Chhetri, Newar, Gurung, Rai, Magar, Tamang, Tharu)
const NEPALESE_SURNAMES = new Set([
  'thapa', 'gurung', 'rai', 'tamang', 'shrestha', 'karki', 'adhikari', 'bista', 'bhattarai',
  'magar', 'basnet', 'khatri', 'poudel', 'paudel', 'ghimire', 'dahal', 'pokharel', 'regmi',
  'acharya', 'rijal', 'gautam', 'subedi', 'bhandari', 'kc', 'khadka', 'oli', 'rawat', 'bohara',
  'budha', 'rokaya', 'shahi', 'chand', 'thakuri', 'malla', 'giri', 'puri', 'bharati', 'devkota',
  'mainali', 'neupane', 'parajuli', 'kafle', 'kaphle', 'sapkota', 'bastola', 'lamichhane', 'baral',
  'aryal', 'sigdel', 'chalise', 'wagle', 'silwal', 'pudasaini', 'dhakal', 'timilsina', 'kadel',
  'pant', 'upadhyaya', 'pokhrel', 'pandit', 'koirala', 'chhetri', 'kandel', 'dangol',
  'maharjan', 'bajracharya', 'shakya', 'tuladhar', 'pradhan', 'manandhar', 'sayami', 'tandukar',
  'khadgi', 'kapali', 'kasula', 'suwal', 'karmacharya', 'tamrakar', 'kayastha', 'amatya',
  'vaidya', 'munikar', 'niraula', 'gyawali', 'chapagain', 'khanal', 'dangi', 'tharu',
  'mahato', 'kushwaha', 'danuwar', 'darai', 'kumal', 'mahaju',
]);

// Sri Lankan Surnames (Sinhalese, Sri Lankan Tamil, Burgher, Moor)
const SRI_LANKAN_SURNAMES = new Set([
  // Sinhalese
  'perera', 'fernando', 'silva', 'wickramasinghe', 'wickremesinghe', 'rajapaksa', 'jayasuriya',
  'dissanayake', 'bandara', 'gunaratne', 'senanayake', 'jayawardena', 'jayawardene', 'ranatunga',
  'mendis', 'karunaratne', 'weerasinghe', 'herath', 'rathnayake', 'ratnayake', 'kulatunga',
  'samarasinghe', 'wijesinghe', 'amarasinghe', 'abeyratne', 'ekanayake', 'tennakoon', 'alahakoon',
  'madugalle', 'gamage', 'liyanage', 'hettiarachchi', 'vithanage', 'nanayakkara', 'siriwardena',
  'gunasekara', 'balasuriya', 'jayatillake', 'wanninayake', 'kariyawasam', 'lokuge', 'rodrigo',
  'fonseka', 'pieris', 'peiris', 'alwis', 'cooray', 'nonis', 'salgado', 'tissera', 'suwaris',
  'athukorala', 'jayasinghe', 'wijeratne', 'abeywickrama', 'senaratne', 'subasinghe', 'pathirana',
  'edirisinghe', 'basnayake', 'mallawaarachchi', 'karunasena', 'weerakkody', 'munasinghe',
  'samarakoon', 'ratwatte', 'de silva', 'de mel', 'de zoysa', 'de alwis', 'de saram',

  // Sri Lankan Tamil
  'sivanesan', 'tharmalingam', 'rasiah', 'selvarajah', 'maheswaran', 'yogarajah', 'kumarasamy',
  'nadarajah', 'ponnambalam', 'chelvanayakam', 'amirthalingam', 'sundaralingam', 'kadirgamar',
  'kanagaratnam', 'thillainathan', 'sivagnanam', 'sivapalan', 'kandasamy', 'balasingham',
  'rajasingham', 'muthucumaraswamy', 'navaratnam', 'sabaratnam', 'paramasivam', 'shanmugalingam',
  'vigneshwaran', 'anandasangaree', 'gnanapragasam', 'arunachalam',
]);

// ============================================================================
// 2. GIVEN NAMES BY COUNTRY / REGION
// ============================================================================

const SOUTH_ASIAN_FIRST_NAMES = new Set([
  // Indian First Names
  'rahul', 'rohit', 'amit', 'raj', 'rajesh', 'suresh', 'ramesh', 'vijay', 'ajay', 'sanjay',
  'anil', 'manoj', 'vikram', 'arun', 'alok', 'abhishek', 'anand', 'deepak', 'sunil', 'dinesh',
  'pankaj', 'pradeep', 'naveen', 'santosh', 'ashok', 'ravi', 'kiran', 'vinod', 'mahesh', 'naresh',
  'satish', 'praveen', 'harish', 'gopal', 'karthik', 'kartik', 'srinivas', 'srikanth', 'venkat',
  'krishna', 'mohan', 'arjun', 'aditya', 'adithya', 'varun', 'rohan', 'karan', 'nikhil', 'gaurav',
  'akash', 'manish', 'ashish', 'sumit', 'saurabh', 'sourabh', 'vivek', 'vishal', 'chetan', 'swapnil',
  'amol', 'sagar', 'bhushan', 'utkarsh', 'rishabh', 'rishab', 'chirag', 'yash', 'tanmay', 'dev',
  'aniket', 'prateek', 'ankit', 'shubham', 'shubhan', 'ayush', 'harsh', 'harshit', 'kunal', 'piyush', 'mohit',
  'roshan', 'shantanu', 'pranav', 'tushar', 'hemant', 'girish', 'avinash', 'akhil', 'ajit', 'abhinav',
  'tejas', 'prashant', 'shashank', 'surya', 'bharat', 'ganesh', 'chaitanya', 'rishi', 'kishore', 'gautam',
  'narendra', 'shivam', 'raghav', 'tarun', 'tharun', 'yuvraj', 'harpreet', 'gurpreet', 'kamal', 'mukesh', 'rajiv',
  'priya', 'pooja', 'neha', 'anjali', 'swati', 'sneha', 'deepa', 'divya', 'kavita', 'meena', 'sunita',
  'anita', 'shweta', 'preeti', 'rekha', 'ritu', 'asha', 'radha', 'laxmi', 'geeta', 'shilpa', 'vandana',
  'sonia', 'nisha', 'rashmi', 'archana', 'seema', 'shreya', 'ananya', 'aishwarya', 'aditi', 'tanya',
  'tanvi', 'pallavi', 'sushma', 'rupali', 'vidya', 'ramya', 'kavya', 'navya', 'ishita', 'disha',
  'kriti', 'simran', 'komal', 'payal', 'priyanka', 'ankita', 'sonal', 'nidhi', 'shruti', 'smriti',
  'yeswanth', 'yeshwanth', 'yaswanth', 'revanth', 'vaasanthi', 'mouli', 'siddhika', 'vaividhya', 'nabin', 'dubasi', 'rohith',
  'karthika', 'pranitha', 'shiva', 'devansh', 'jyotsna', 'priyanshi', 'rushil', 'vinay', 'mourya',
  'gopi', 'teja', 'satya', 'siddharth', 'samsundar', 'jaisy', 'sathvik', 'samiksha', 'vedika',
  'keerthana', 'haswanth', 'vishweshwar', 'gouri', 'gauri', 'aarthi', 'arti', 'srilekha', 'shashikanth',
  'rajasekhar', 'monalisha', 'monalisa', 'kunj', 'sohail', 'adarsh', 'bhavana', 'srija', 'rayani',
  'vineeth', 'sandeep', 'parul', 'pranathi', 'deepika', 'pratyusha', 'tejaswi', 'sai', 'anusha',
  'madhuri', 'lavanya', 'pavani', 'soumya', 'sandhya', 'sravani', 'manasa', 'alekhya', 'bhavya',
  'swetha', 'meghana', 'harshitha', 'rohini', 'sahithi', 'shilpa', 'ashwin', 'aravind', 'arvind',
  'santhosh', 'sreekanth', 'raghavendra', 'venkatesh', 'varunraj', 'mayank', 'abu', 'bakir',
  'nikshit', 'kartheek', 'sushmitha', 'sushanth', 'sruthi', 'jaimi', 'sindhuja', 'shriya', 'srilaxmi',
  'kirti', 'ujwal', 'anushka', 'lokesh', 'divy', 'praful', 'vaibhav', 'gowthami', 'saiesha', 'anwesha',
  'maneesh', 'sharika', 'tejaswini', 'pradnya', 'rithvik', 'sampath', 'ranithkumar', 'varsha', 'akilesh',
  'susanth', 'swapna', 'deepthi', 'pranay', 'rachana', 'pavan', 'eswar', 'yougender', 'keerthanaa',
  'nagajothi', 'vaishnavi', 'tripura', 'damodara', 'vraj', 'mahathi', 'tulasi', 'likitha', 'amitha',
  'munilikhitha', 'jayanthi', 'nikhila', 'rutvik', 'samyuktha', 'lahari', 'mounika', 'geetha', 'sujitha',
  'anudeep', 'sravika', 'sowseelyatha', 'nandini', 'mahith', 'vansh', 'anusree', 'arvinth', 'vindya',
  'sharmista', 'braju', 'tejasri', 'kadari', 'bhuvaneshwari', 'maneesha', 'abhiram', 'goutham', 'venkata',
  'nikitha', 'nanditha', 'yashwanthi', 'bhogesh', 'manikanta', 'sakshi', 'ashwini', 'tirth', 'keerthi',
  'subhasmita', 'charish', 'vishwajyothi', 'venu', 'datthu', 'bharodiya', 'maharana', 'reshmi',
  'mendonsa', 'mendonca',

  // South Asian Muslim First Names (India, Pakistan, Bangladesh)
  'mohammed', 'muhammad', 'mohammad', 'mohamed', 'ibrahim', 'wajahat', 'saad', 'ayesha', 'rameez',
  'faraz', 'salman', 'bilal', 'aijaz', 'safwan', 'shoaib', 'tariq', 'hamza', 'imran', 'sohail',
  'faisal', 'zeeshan', 'rizwan', 'adnan', 'arsalan', 'farhan', 'rehan', 'irfan', 'ashraf', 'asif',
  'arif', 'naveed', 'junaid', 'hamid', 'rashid', 'saeed', 'mansoor', 'murtaza', 'waqas', 'shahid',
  'zubair', 'babar', 'danish', 'jawad', 'kamran', 'umair', 'yasir', 'zaheer', 'usman', 'kashif',
  'shahbaz', 'khurram', 'haroon', 'waseem', 'noman', 'atiya', 'minhaz', 'nabeel', 'munir',
  'ahmad', 'jabbar', 'ahmed', 'hassan', 'hussain', 'ali', 'khan',
  'mustafa', 'murtaza', 'qasim', 'shariq', 'shayan', 'sarmad', 'zohaib', 'ahsan', 'aqeel', 'alamgir',
  'shafia', 'kashfia', 'sharmin', 'shehryar', 'shehreyaar',

  // Bangladeshi First Names
  'hasibur', 'rashik', 'arafat', 'tariqul', 'shakib', 'tamim', 'mushfiqur', 'mustafizur', 'mehedi',
  'soumya', 'taskin', 'anamul', 'rubel', 'tawhid', 'afif', 'hasan', 'mahmudullah',
  'jahid', 'ashik', 'tanvir', 'kawsar', 'sohag', 'shahadat', 'mominul', 'saif', 'liton',
  'bijoy', 'shanto', 'mithun', 'sabbir', 'al-amin', 'mashrafe',

  // Nepalese First Names
  'birat', 'bikram', 'dipendra', 'paras', 'prithvi', 'birendra', 'mahendra', 'tribhuvan',
  'sushil', 'madhav', 'kewal', 'santosh', 'prakash', 'dipak', 'subash', 'khem', 'lok',
  'narayan', 'shambhu', 'chandra', 'suraj', 'rajendra', 'saroj', 'rabin', 'sita', 'gita',
  'anup', 'bishal', 'sagar', 'sandesh', 'sujan', 'sushant', 'bibek', 'aayush', 'roshan',
  'hrishabh',

  // Sri Lankan First Names
  'arjuna', 'sanath', 'muttiah', 'chaminda', 'mahela', 'lasith', 'tilak', 'dimuth',
  'kusal', 'danushka', 'lahiru', 'wanindu', 'dasun', 'charith', 'pathum', 'ashen', 'avishka',
  'bhanuka', 'nuwan', 'dilshan', 'rangana', 'suranga', 'upul', 'chamara', 'dinesh',
  'roshan', 'thilina', 'chathura', 'kasun', 'shehan', 'pramod', 'nadeeka', 'sanduni',
]);

// Strong South Asian Honorifics / Lineage Prefixes
const SOUTH_ASIAN_PREFIXES = [
  /^md\b/i, /^mohd\b/i, /^mhd\b/i, /^syed\b/i, /^sheikh\b/i, /^shaik\b/i,
  /^sardar\b/i, /^mirza\b/i, /^chaudhry\b/i, /^chaudhary\b/i, /^qazi\b/i,
  /^khan\b/i, /^malik\b/i, /^pandit\b/i,
];

// Target Institutions across India, Pakistan, Bangladesh, Nepal, Sri Lanka
const SOUTH_ASIAN_INSTITUTION_WORDS = [
  { pattern: /\b(anna\s+univ|osmania|jntu|vtu|iit|nit|bits\s+pilani|birla\s+institute|amrita(?:\s+vishwa)?|kakatiya|bvrit|b\.?v\.?\s*raju|sasi\s+institute|nalla\s+narasimha|mysore|lovely\s+professional|lpu|visvesvaraya|amity|manipal|vit\s+univ|srm|thapar|symbiosis|delhi\s+univ|mumbai\s+univ|pune\s+univ|calcutta\s+univ|madras\s+univ|bengaluru\s+univ|kerala\s+univ|andhra\s+univ|nagpur\s+univ|gujarat\s+univ|rajasthan\s+univ|panjab\s+univ|punjabi\s+univ|kurukshetra|aligarh|jamia|bhu|jnu|iiit|national\s+inst(?:itute)?\s+of\s+science|isbm|dr\s+mgr|mgr\s+educational|colaberry|great\s+lakes|nmims|spjimr|xlri|iim|gitam|cbit|vasavi|vnr|snist|klu|vel\s+tech|sathyabama|pes\s+univ|rv\s+college|bms\s+college|ms\s+ramaiah|coep|vjti|nirma|daiict|kiit|iter|soa\s+univ)\b/i, country: 'India' as const },
  { pattern: /\b(lums|nust|fast(?:\s+nuces)?|air\s+university|uet\s+lahore|giki|iba\s+karachi|aga\s+khan|quaid-e-azam|univ(?:ersity)?\s+of\s+sindh)\b/i, country: 'Pakistan' as const },
  { pattern: /\b(dhaka\s+univ|buet|north\s+south\s+univ|brac|jahangirnagar|rajshahi\s+univ)\b/i, country: 'Bangladesh' as const },
  { pattern: /\b(tribhuvan|kathmandu\s+univ|pokhara\s+univ)\b/i, country: 'Nepal' as const },
  { pattern: /\b(univ(?:ersity)?\s+of\s+colombo|univ(?:ersity)?\s+of\s+peradeniya|univ(?:ersity)?\s+of\s+moratuwa|kelaniya|sri\s+jayewardenepura|ruhuna|jaffna)\b/i, country: 'Sri Lanka' as const },
];

// ============================================================================
// 1B. NEGATIVE EXCLUSION DICTIONARIES (AFRICAN, ARAB, EAST ASIAN, EUROPEAN, ANGLO)
// Prevents false-positive classification of non-Indian / non-Pakistani leads
// ============================================================================

// African / Nigerian / West / East African Name Markers
const AFRICAN_NAME_MARKERS = new Set([
  // Nigerian Yoruba
  'adebayo', 'adeyemi', 'adeniyi', 'adelaja', 'adewale', 'adeleke', 'adebisi', 'adeola', 'adegoke',
  'kehinde', 'taiwo', 'idowu', 'alabi', 'balogun', 'ajayi', 'omodara', 'omotosho', 'bakare', 'sanusi',
  'oluwaseun', 'olumide', 'olutayo', 'oluwafemi', 'oluwaseyi', 'olanrewaju', 'olan', 'babatunde', 'babalola',
  'ayeni', 'ogundele', 'ogunleye', 'folarin', 'folake', 'afolabi', 'akindele', 'akintola', 'tinubu', 'obasanjo',
  'awolowo', 'fashola', 'osinbajo', 'oyedepo', 'oyediran', 'adekunle', 'adejumo', 'adesina', 'aderemi',
  'fajuyi', 'agbaje', 'dada', 'falana', 'oladipo', 'omojola', 'sowore', 'odumakin',

  // Nigerian Igbo
  'ekwem', 'okafor', 'eze', 'okeke', 'okonkwo', 'igwe', 'uche', 'onyeka', 'ugochukwu', 'nnamdi',
  'nwosu', 'nwachukwu', 'nwankwo', 'nwokolo', 'chukwu', 'chukwudi', 'chinonso', 'chioma', 'chinedu',
  'chidinma', 'chimamanda', 'chika', 'chinenye', 'nkechi', 'obi', 'obinna', 'obianuju', 'emeka',
  'ogbonna', 'ogbodo', 'agwu', 'agu', 'okoli', 'ani', 'iloh', 'enwerem', 'kalu', 'orji',
  'madu', 'amadi', 'ijeoma', 'ngozi', 'chigozie', 'nwabueze', 'nwoye', 'osita', 'achebe', 'okoro',

  // Nigerian Efik / Ibibio / Niger Delta
  'uduak', 'etim', 'effiong', 'akan', 'bassey', 'aniefiok', 'edet', 'inyene', 'ubong', 'idem', 'akpan',
  'ekong', 'asuno', 'asanga', 'abasi', 'uyo', 'nsikak', 'ekpo', 'okon', 'ita', 'iniobong', 'emem',
  'udoh', 'essien', 'archibong', 'eyen', 'asikpo', 'utang',

  // Cameroonian / Manyu / Central & West African
  'arrey', 'tanyi', 'besong', 'agbor', 'ayuk', 'taku', 'enow', 'ashu', 'ndip', 'ngwa', 'che', 'fru',
  'biya', 'kamga', 'etoo', 'nkono', 'tamba', 'ebobisse', 'milla', 'song', 'nfor', 'fon',

  // Ghanaian
  'mensah', 'boateng', 'osei', 'appiah', 'owusu', 'gyasi', 'frimpong', 'agyemang', 'asante', 'quaye',
  'addison', 'adjei', 'kofi', 'kwame', 'kwaku', 'yaw', 'akua', 'abena', 'amponsah', 'darko', 'opoku',
  'ansah', 'sarfo', 'boakye', 'badu', 'asare', 'donkor', 'adomah', 'antwi', 'fordjour', 'essien',

  // East African (Kenya, Uganda, Tanzania, Ethiopia, Eritrea)
  'mwangi', 'kamau', 'maina', 'otieno', 'ochieng', 'odhiambo', 'kipkorir', 'kipchoge', 'kiprono',
  'cheruiyot', 'wanyonyi', 'mutua', 'mutiso', 'kiptoo', 'rotich', 'koech', 'korir', 'kimani', 'kariuki',
  'ngugi', 'karanja', 'mugo', 'macharia', 'nyambura', 'wambui', 'njeri', 'muthoni', 'akinyi', 'atieno',
  'tesfaye', 'haile', 'bekele', 'alemu', 'berhanu', 'gebre', 'tadesse', 'yohannes', 'abera', 'mengistu',
  'dibaba', 'kebede', 'wolde', 'asfaw', 'worku', 'tefera', 'girma', 'negash', 'afework',

  // West African Francophone (Senegal, Mali, Guinea, Ivory Coast)
  'traore', 'keita', 'ouattara', 'diop', 'coulibaly', 'toure', 'sow', 'bah', 'diallo', 'barry',
  'camara', 'cisse', 'kone', 'fofana', 'sylla', 'sangare', 'sissoko', 'drame', 'sacko',
  'sidibe', 'tangara', 'kanoute', 'dembele', 'ba', 'ndiaye', 'fall', 'seck', 'gueye', 'mbaye', 'sarr',
]);

// East Asian / Southeast Asian Surnames
const EAST_ASIAN_SURNAMES = new Set([
  // Chinese / Taiwanese / Hong Kong / Singaporean
  'chiang', 'chen', 'lin', 'huang', 'zhang', 'wang', 'li', 'liu', 'yang', 'wu', 'zhao', 'zhou',
  'xu', 'sun', 'ma', 'zhu', 'hu', 'guo', 'he', 'gao', 'luo', 'zheng', 'liang', 'xie', 'song',
  'tang', 'han', 'feng', 'deng', 'cao', 'peng', 'zeng', 'xiao', 'tian', 'dong', 'yuan', 'pan',
  'yu', 'jiang', 'cai', 'jia', 'ding', 'yan', 'tsai', 'chang', 'chou', 'kuo', 'hsiao', 'lai',
  'chuang', 'hung', 'wen', 'hsieh', 'cheng', 'lo', 'hsu', 'wong', 'chan', 'ho', 'cheung', 'lau',
  'yeung', 'yuen', 'leung', 'kwok', 'lu', 'su', 'wei', 'zhuang', 'shen', 'jin', 'meng',

  // Korean
  'kim', 'park', 'choi', 'jeong', 'jung', 'kang', 'cho', 'yoon', 'jang', 'lim', 'han', 'shin',
  'seo', 'kwon', 'son', 'hwang', 'ahn', 'hong', 'bae', 'moon', 'ryu', 'ko',

  // Vietnamese
  'nguyen', 'tran', 'le', 'pham', 'hoang', 'huynh', 'phan', 'vu', 'vo', 'dang', 'bui', 'do',
  'ngo', 'duong', 'ly', 'dinh', 'dao', 'doan',

  // Japanese
  'sato', 'suzuki', 'takahashi', 'tanaka', 'watanabe', 'ito', 'yamamoto', 'nakamura', 'kobayashi',
  'kato', 'yoshida', 'yamada', 'sasaki', 'yamaguchi', 'matsumoto', 'inoue', 'kimura', 'hayashi',
  'shimizu', 'yamazaki', 'mori', 'abe', 'ikeda', 'hashimoto', 'yamashita', 'ishikawa', 'nakajima',
]);

// Middle Eastern / Arab Levantine / Gulf / North African Surnames & Given Names
const ARAB_MIDDLE_EASTERN_NAMES = new Set([
  'adnan', 'mansour', 'haddad', 'khalil', 'el-masry', 'kabbani', 'shammas', 'trabelsi',
  'barakat', 'abboud', 'assaf', 'khoury', 'nassif', 'matar', 'sayegh', 'daher', 'moussa',
  'hariri', 'antoun', 'sleiman', 'saliba', 'al-ghamdi', 'al-shehri', 'al-zahrani',
  'al-dossary', 'al-mutairi', 'al-anazi', 'al-shammari', 'al-subaie', 'al-otibi', 'al-khalidi',
  'al-hajri', 'al-amri', 'omar', 'khaled', 'khalid', 'zaid', 'tarek', 'youssef', 'yousef',
  'mahmoud', 'hisham', 'rami', 'fadi', 'bashar', 'ziad', 'marwan', 'hatem',
  'waleed', 'walid', 'nader', 'ziyad', 'nasser', 'amr', 'hussein', 'tareq', 'bassam',
]);

// European / Germanic / Hispanic / Jewish Markers
const GERMANIC_HISPANIC_MARKERS = new Set([
  'sigler', 'schmidt', 'mueller', 'schneider', 'fischer', 'weber', 'meyer', 'wagner', 'becker',
  'hoffmann', 'schulz', 'koch', 'bauer', 'richter', 'klein', 'wolf', 'schroeder', 'neumann',
  'schwarz', 'zimmermann', 'braun', 'krueger', 'hartmann', 'lange', 'werner', 'schmitz', 'krause',
  'meier', 'lehmann', 'schmid', 'koenig', 'cohen', 'levy', 'goldberg', 'rosenberg', 'friedman',
  'bernstein', 'katz', 'stern', 'weinstein', 'shapiro', 'grossman', 'hernandez', 'garcia',
  'martinez', 'rodriguez', 'lopez', 'gonzalez', 'perez', 'sanchez', 'ramirez', 'torres', 'flores',
  'rivera', 'gomez', 'diaz', 'reyes', 'morales', 'cruz', 'ortiz', 'gutierrez', 'chavez', 'ramos',
  'vargas', 'castillo', 'alvarez', 'mendez', 'ruiz',
]);

// Anglo / Western Given Names (Used to identify polysemic Anglo false positives like Ronnie Roy, Paul Mash)
const ANGLO_FIRST_NAMES = new Set([
  'ronnie', 'ronald', 'patrick', 'brandon', 'ryan', 'scott', 'kyle', 'tyler', 'bradley', 'austin',
  'cody', 'dustin', 'travis', 'brett', 'trevor', 'logan', 'hunter', 'tanner', 'dalton', 'colton',
  'dakota', 'george', 'thomas', 'alexander', 'william', 'robert', 'richard', 'james', 'charles',
  'edward', 'henry', 'arthur', 'brian', 'kevin', 'gary', 'keith', 'terry', 'wayne', 'randy',
  'todd', 'brad', 'chad', 'eric', 'justin', 'jason', 'jeremy', 'jeffrey', 'steven', 'timothy',
  'kenneth', 'donald', 'gregory', 'douglas', 'russell', 'philip', 'frank', 'jack', 'harry',
  'steve', 'dan', 'danny', 'bob', 'bobby', 'bill', 'billy', 'tom', 'tommy', 'jim', 'jimmy',
  'joe', 'joey', 'mike', 'dave', 'chris', 'matt', 'josh', 'luke', 'mark', 'sam', 'ben', 'jake',
  'nick', 'alex', 'bruce', 'craig', 'brent', 'troy', 'shane', 'curtis', 'glenn', 'kirk',
  'paul', 'john', 'david', 'peter', 'michael', 'melvin', 'landon', 'jonathan', 'mackenzie', 'derek',
  'mary', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
  'nancy', 'lisa', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily', 'donna',
  'michelle', 'carol', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon',
  'laura', 'cynthia', 'kathleen', 'amy', 'shirley', 'angela', 'helen', 'anna', 'brenda',
  'pamela', 'nicole', 'samantha', 'katherine', 'christine', 'debra', 'rachel', 'carolyn',
  'janet', 'catherine', 'maria', 'heather', 'diane', 'ruth', 'julie', 'olivia', 'joyce',
]);

// Polysemic Surnames (Can be either South Asian or Anglo/Western/Scottish/Irish)
const POLYSEMIC_SURNAMES = new Set([
  'roy', 'ray', 'dey', 'gill', 'mann', 'paul', 'pal', 'best', 'dale', 'dean', 'ward', 'bell', 'stone',
  'ford', 'hall', 'long', 'short', 'brown', 'white', 'green', 'bain', 'bains', 'gage', 'may',
]);

/**
 * Normalizes tokens for dictionary matching
 */
function cleanToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z]/g, '').trim();
}

/**
 * Checks for negative exclusions (Anti-pattern detection)
 * Rejects African, Arab, East Asian, European, and Anglo-Polysemic profiles
 */
export function checkNegativeExclusion(
  full: string,
  first: string,
  last: string,
  tokens: string[],
  email?: string | null
): { isExcluded: boolean; reason: string } | null {
  // Extract email tokens if available (e.g. hassanolanrewaju911 -> olanrewaju)
  const emailTokens: string[] = [];
  if (email) {
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z]/g, ' ');
    const parts = username.split(/\s+/).filter(p => p.length >= 3);
    emailTokens.push(...parts);
  }
  const allTokens = [...tokens, ...emailTokens];

  // 1. African / Nigerian / West / East African Exclusion
  for (const t of allTokens) {
    if (AFRICAN_NAME_MARKERS.has(t)) {
      return {
        isExcluded: true,
        reason: `Identified African/Nigerian name marker ("${t}") - outside Indian/Pakistani criteria`,
      };
    }
    if (t.length >= 6) {
      if (/^(?:ade|olu|oluwa|olan|baba|chukwu|ogba|ogbo|nwa|afol|akint|ekwe)/i.test(t)) {
        return {
          isExcluded: true,
          reason: `Matches African/Nigerian name root pattern ("${t}") - outside Indian/Pakistani criteria`,
        };
      }
      if (/(?:bayo|waju|tunde|sanya|ebuka|chukwu)$/i.test(t)) {
        return {
          isExcluded: true,
          reason: `Matches African/Nigerian suffix pattern ("${t}") - outside Indian/Pakistani criteria`,
        };
      }
    }
  }

  // 2. East Asian / Southeast Asian Surnames
  for (const t of allTokens) {
    if (EAST_ASIAN_SURNAMES.has(t)) {
      const isLastNameOrSuffix = t === cleanToken(last) || t === tokens[tokens.length - 1] || emailTokens.includes(t);
      if (isLastNameOrSuffix && !INDIAN_SURNAMES.has(cleanToken(first))) {
        return {
          isExcluded: true,
          reason: `Identified East Asian family name ("${t}") - outside Indian/Pakistani criteria`,
        };
      }
    }
  }

  // 3. European / Romanian / Moldovan / Slavic / Germanic / Hispanic Exclusions
  for (const t of allTokens) {
    if (t.length >= 5 && (t.endsWith('eanu') || t.endsWith('escu'))) {
      return {
        isExcluded: true,
        reason: `Matches Romanian/European family name pattern ("${t}") - outside Indian/Pakistani criteria`,
      };
    }
    if (GERMANIC_HISPANIC_MARKERS.has(t)) {
      return {
        isExcluded: true,
        reason: `Identified Germanic/Western/Hispanic name marker ("${t}") - outside Indian/Pakistani criteria`,
      };
    }
  }

  // 4. Middle Eastern / Arab Levantine / Gulf combinations without Indian/Pakistani lineage
  const arabTokens = tokens.filter(t => ARAB_MIDDLE_EASTERN_NAMES.has(t));
  if (arabTokens.length >= 2 || (arabTokens.length >= 1 && tokens.length <= 2 && ARAB_MIDDLE_EASTERN_NAMES.has(tokens[tokens.length - 1]))) {
    const hasIndianOrPakSpecific = tokens.some(t =>
      (INDIAN_SURNAMES.has(t) && !POLYSEMIC_SURNAMES.has(t)) ||
      (PAKISTANI_SURNAMES.has(t) && !['ali', 'hassan', 'hussain', 'ahmed'].includes(t))
    );
    if (!hasIndianOrPakSpecific) {
      return {
        isExcluded: true,
        reason: `Middle Eastern / Arab name marker ("${arabTokens.join(' ')}") without Indian/Pakistani lineage - outside criteria`,
      };
    }
  }

  // 5. Anglo Given Name + Polysemic Surname Exclusion (e.g. "Ronnie Roy", "Patrick Roy", "Brandon Roy", "Kyle Gill")
  const firstToken = cleanToken(first) || tokens[0] || '';
  const lastToken = cleanToken(last) || tokens[tokens.length - 1] || '';
  if (ANGLO_FIRST_NAMES.has(firstToken) && POLYSEMIC_SURNAMES.has(lastToken)) {
    const hasDistinctSouthAsian = tokens.some(t =>
      t !== firstToken && t !== lastToken &&
      (INDIAN_SURNAMES.has(t) || PAKISTANI_SURNAMES.has(t) || SOUTH_ASIAN_FIRST_NAMES.has(t))
    );
    if (!hasDistinctSouthAsian) {
      return {
        isExcluded: true,
        reason: `Anglo given name paired with polysemic surname ("${firstToken} ${lastToken}") without Indian/Pakistani lineage`,
      };
    }
  }

  // 6. American generational suffixes (Jr, Sr, II, III, IV) with Western / non-South Asian name
  if (/\b(?:jr|sr|ii|iii|iv)\b/i.test(full)) {
    const hasDistinctIndian = tokens.some(t =>
      (INDIAN_SURNAMES.has(t) && !POLYSEMIC_SURNAMES.has(t)) ||
      (PAKISTANI_SURNAMES.has(t) && !['ali', 'hassan', 'hussain'].includes(t))
    );
    if (!hasDistinctIndian) {
      return {
        isExcluded: true,
        reason: `Western/American generational suffix without Indian/Pakistani surname ("${full}")`,
      };
    }
  }

  return null;
}

/**
 * Main South Asian Origin Classifier Function
 */
export function classifySouthAsianOrigin(
  fullName: string | undefined | null,
  firstName?: string | undefined | null,
  lastName?: string | undefined | null,
  headline?: string | undefined | null,
  educationInstitution?: string | undefined | null,
  location?: string | undefined | null,
  email?: string | undefined | null
): OriginResult {
  const full = (fullName || '').trim();
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  const edu = (educationInstitution || '').trim();
  const loc = (location || '').toLowerCase();
  const hl = (headline || '').toLowerCase();

  const tokens: string[] = `${full} ${first} ${last}`
    .split(/[\s,\.\-_/]+/)
    .map(cleanToken)
    .filter(t => t.length > 1);

  // 0. Negative Exclusions (Anti-pattern checks: African, Arab, East Asian, European, Anglo-Polysemic)
  const exclusion = checkNegativeExclusion(full, first, last, tokens, email);
  if (exclusion && exclusion.isExcluded) {
    return {
      origin: 'OTHER',
      confidence: 0.95,
      matchReason: exclusion.reason,
      isSouthAsian: false,
    };
  }

  // 1. Institution Check (Whole-word pattern matching on Education or Headline)
  for (const inst of SOUTH_ASIAN_INSTITUTION_WORDS) {
    if (edu && inst.pattern.test(edu)) {
      return {
        origin: 'SOUTH_ASIAN',
        countryMatch: inst.country,
        confidence: 0.98,
        matchReason: `Alumnus of confirmed South Asian institution: "${edu}" (${inst.country})`,
        isSouthAsian: true,
      };
    }
    if (hl && inst.pattern.test(hl)) {
      return {
        origin: 'SOUTH_ASIAN',
        countryMatch: inst.country,
        confidence: 0.95,
        matchReason: `Headline cites South Asian institution (${inst.country})`,
        isSouthAsian: true,
      };
    }
  }

  // 2. Check Name Prefixes (e.g. Md, Syed, Shaik, Sheikh, Khan)
  for (const pfx of SOUTH_ASIAN_PREFIXES) {
    if (pfx.test(full) || pfx.test(first)) {
      return {
        origin: 'SOUTH_ASIAN',
        countryMatch: 'South Asia',
        confidence: 0.95,
        matchReason: `Name carries distinctive South Asian lineage prefix: "${full}"`,
        isSouthAsian: true,
      };
    }
  }

  // 3. Surname & Lineage Matching across Sri Lanka, Nepal, Bangladesh, Pakistan, India
  for (const t of tokens) {
    if (SRI_LANKAN_SURNAMES.has(t)) {
      return {
        origin: 'SOUTH_ASIAN',
        countryMatch: 'Sri Lanka',
        confidence: 0.95,
        matchReason: `Matched Sri Lankan family name: "${t}"`,
        isSouthAsian: true,
      };
    }
    if (NEPALESE_SURNAMES.has(t)) {
      return {
        origin: 'SOUTH_ASIAN',
        countryMatch: 'Nepal',
        confidence: 0.95,
        matchReason: `Matched Nepalese surname: "${t}"`,
        isSouthAsian: true,
      };
    }
    if (BANGLADESHI_SURNAMES.has(t)) {
      return {
        origin: 'SOUTH_ASIAN',
        countryMatch: 'Bangladesh',
        confidence: 0.95,
        matchReason: `Matched Bangladeshi surname: "${t}"`,
        isSouthAsian: true,
      };
    }
    if (PAKISTANI_SURNAMES.has(t)) {
      return {
        origin: 'SOUTH_ASIAN',
        countryMatch: 'Pakistan',
        confidence: 0.95,
        matchReason: `Matched Pakistani family name: "${t}"`,
        isSouthAsian: true,
      };
    }
    if (INDIAN_SURNAMES.has(t)) {
      if (POLYSEMIC_SURNAMES.has(t)) {
        // Polysemic token (e.g. paul, roy, gill, ray, dey, dean, white, brown)
        // Must have another distinct South Asian token, first name, or institution to match!
        const hasOtherSouthAsian = tokens.some(other =>
          other !== t && (
            (INDIAN_SURNAMES.has(other) && !POLYSEMIC_SURNAMES.has(other)) ||
            PAKISTANI_SURNAMES.has(other) ||
            BANGLADESHI_SURNAMES.has(other) ||
            NEPALESE_SURNAMES.has(other) ||
            SRI_LANKAN_SURNAMES.has(other) ||
            SOUTH_ASIAN_FIRST_NAMES.has(other)
          )
        );
        if (!hasOtherSouthAsian) {
          continue; // Skip isolated polysemic token
        }
      }
      return {
        origin: 'SOUTH_ASIAN',
        countryMatch: 'India',
        confidence: 0.95,
        matchReason: `Matched Indian surname/lineage: "${t}"`,
        isSouthAsian: true,
      };
    }
  }

  // 4. Given Name Matching (High accuracy first names)
  for (const t of tokens) {
    if (SOUTH_ASIAN_FIRST_NAMES.has(t)) {
      return {
        origin: 'SOUTH_ASIAN',
        countryMatch: 'South Asia',
        confidence: 0.93,
        matchReason: `Matched distinctive South Asian given name: "${t}"`,
        isSouthAsian: true,
      };
    }
  }

  // 5. Linguistic Suffix Matching (High accuracy South Asian morphological patterns)
  for (const t of tokens) {
    if (t.length >= 4) {
      // Marathi / Goan: -kar, -ker (e.g. Tendulkar, Gavaskar, Pednekar)
      if (t.endsWith('kar') || t.endsWith('ker')) {
        return {
          origin: 'SOUTH_ASIAN',
          countryMatch: 'India',
          confidence: 0.95,
          matchReason: `Matched distinctive Indian linguistic suffix (-kar/-ker): "${t}"`,
          isSouthAsian: true,
        };
      }
      // South Indian (Telugu/Kannada/Tamil): -palli, -pally, -palle, -bhavi, -guda, -setti, -pudi, -gadda, -kuru, -kuri, -pati, -mudi, -dapu, -raju, -konda, -kunta, -reddi
      if (
        t.endsWith('palli') ||
        t.endsWith('pally') ||
        t.endsWith('palle') ||
        t.endsWith('guda') ||
        t.endsWith('bhavi') ||
        t.endsWith('setti') ||
        t.endsWith('pudi') ||
        t.endsWith('gadda') ||
        t.endsWith('kuru') ||
        t.endsWith('kuri') ||
        t.endsWith('pati') ||
        t.endsWith('mudi') ||
        t.endsWith('dapu') ||
        t.endsWith('raju') ||
        t.endsWith('konda') ||
        t.endsWith('kunta') ||
        t.endsWith('reddi')
      ) {
        return {
          origin: 'SOUTH_ASIAN',
          countryMatch: 'India',
          confidence: 0.95,
          matchReason: `Matched distinctive South Indian family name suffix: "${t}"`,
          isSouthAsian: true,
        };
      }
      // Sri Lankan morphological suffixes (-singhe, -ratne, -dissanayake, -arachchi, -nathan, -lingam, -rajah)
      if (
        t.endsWith('singhe') ||
        t.endsWith('ratne') ||
        t.endsWith('dissanayake') ||
        t.endsWith('arachchi') ||
        (t.endsWith('nathan') && t !== 'jonathan' && !t.endsWith('jonathan') && t.length >= 8) ||
        t.endsWith('lingam') ||
        t.endsWith('rajah')
      ) {
        return {
          origin: 'SOUTH_ASIAN',
          countryMatch: 'Sri Lanka',
          confidence: 0.95,
          matchReason: `Matched distinctive Sri Lankan family name suffix: "${t}"`,
          isSouthAsian: true,
        };
      }
      // Nepalese distinctive suffixes (-shrestha, -maharjan, -acharya, -bajracharya)
      if (
        t.endsWith('shrestha') ||
        t.endsWith('maharjan') ||
        t.endsWith('bajracharya')
      ) {
        return {
          origin: 'SOUTH_ASIAN',
          countryMatch: 'Nepal',
          confidence: 0.95,
          matchReason: `Matched distinctive Nepalese surname suffix: "${t}"`,
          isSouthAsian: true,
        };
      }
      // Sindhi / Gujarati: -ani (e.g. Advani, Ambani, Lakhani, Motwani, Bhavnani)
      if (t.endsWith('ani') && t.length >= 5) {
        return {
          origin: 'SOUTH_ASIAN',
          countryMatch: 'India',
          confidence: 0.94,
          matchReason: `Matched distinctive Sindhi/Gujarati lineage suffix (-ani): "${t}"`,
          isSouthAsian: true,
        };
      }
      // Parsi / Gujarati: -wala, -walla (e.g. Poonawala, Batliwala)
      if (t.endsWith('wala') || t.endsWith('walla')) {
        return {
          origin: 'SOUTH_ASIAN',
          countryMatch: 'India',
          confidence: 0.94,
          matchReason: `Matched distinctive Parsi/Gujarati suffix (-wala): "${t}"`,
          isSouthAsian: true,
        };
      }
      // South Asian Islamic suffixes: -ullah, -ulla, -uddin
      if (t.endsWith('ullah') || t.endsWith('ulla') || t.endsWith('uddin')) {
        return {
          origin: 'SOUTH_ASIAN',
          countryMatch: 'South Asia',
          confidence: 0.95,
          matchReason: `Matched South Asian Islamic lineage suffix: "${t}"`,
          isSouthAsian: true,
        };
      }
      // Indian honorific / compound suffixes: -prasad, -babu, -swamy, -swami, -murthy, -murti, -chandra
      if (
        t.endsWith('prasad') ||
        t.endsWith('babu') ||
        t.endsWith('swamy') ||
        t.endsWith('swami') ||
        t.endsWith('murthy') ||
        t.endsWith('murti') ||
        t.endsWith('chandra')
      ) {
        return {
          origin: 'SOUTH_ASIAN',
          countryMatch: 'India',
          confidence: 0.95,
          matchReason: `Matched Indian given name suffix: "${t}"`,
          isSouthAsian: true,
        };
      }
    }
  }

  // 6. Geographic Context in Location or Headline
  const geoPattern = /\b(india|pakistan|bangladesh|nepal|sri lanka|delhi|new delhi|mumbai|bombay|bangalore|bengaluru|hyderabad|chennai|madras|kolkata|calcutta|pune|noida|gurgaon|gurugram|ahmedabad|jaipur|lucknow|chandigarh|indore|bhopal|nagpur|patna|ranchi|bhubaneswar|guwahati|visakhapatnam|vizag|vijayawada|guntur|warangal|coimbatore|madurai|kochi|cochin|trivandrum|lahore|karachi|islamabad|rawalpindi|faisalabad|peshawar|multan|dhaka|chittagong|chattogram|sylhet|kathmandu|pokhara|colombo|kandy|jaffna)\b/i;
  if (geoPattern.test(loc) || geoPattern.test(hl)) {
    return {
      origin: 'SOUTH_ASIAN',
      countryMatch: 'South Asia',
      confidence: 0.90,
      matchReason: 'Profile location/headline indicates South Asian region',
      isSouthAsian: true,
    };
  }

  // Non-matching / Western / other
  return {
    origin: 'OTHER',
    confidence: 0.10,
    matchReason: 'Name/profile does not definitively match South Asian origin (India, Pakistan, Bangladesh, Nepal, Sri Lanka)',
    isSouthAsian: false,
  };
}
